import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { PriceList, PriceListChanges, ServiceRecord } from '@hms/contracts';
import { createPrismaClient, withTenant, type PrismaClient } from '@hms/database';
import { fixedClock } from '@hms/domain-kernel';
import { BillingModule } from '@hms/mod-billing';
import {
  DEFAULT_LOGIN_RATE_LIMITS,
  hashPassword,
  IdentityAccessModule,
} from '@hms/mod-identity-access';
import { PatientsModule } from '@hms/mod-patients';
import { DatabaseModule, RequestPipelineModule } from '@hms/platform';
import {
  dataOf,
  grantPermissions,
  seedEntitlements,
  seedMembership,
  seedTenant,
  seedUser,
  staffClient,
  type StaffClient,
  type StaffSession,
} from '@hms/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from './http/configure-app.js';

// The service catalogue and service prices over real HTTP against PostgreSQL (T-ORD-01;
// FR-ORD-001, FR-ORD-007, FR-CFG-001, FR-CFG-002, FR-BIL-007; SP-03; FR-AUD-001). Synthetic data.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
const clock = fixedClock(new Date('2026-11-19T04:00:00Z'));

@Module({
  imports: [
    RequestPipelineModule.forRoot({ level: 'silent' }),
    DatabaseModule.forRoot(databaseUrl),
    IdentityAccessModule.forRoot(
      {
        timeouts: { idleMinutes: 60, absoluteHours: 12 },
        csrfSecret: 'v'.repeat(32),
        lockout: { maxFailedAttempts: 5, lockMinutes: 15 },
        loginRateLimits: DEFAULT_LOGIN_RATE_LIMITS,
        mfa: { encryptionKey: Buffer.alloc(32, 7), issuer: 'HMS test' },
      },
      clock,
      { allowedOrigins: [WEB] },
    ),
    PatientsModule.forRoot({ clock, nidKey: Buffer.alloc(32, 9) }),
    BillingModule.forRoot({ clock }),
  ],
})
class ServicesTestModule {}

interface Problem {
  code: string;
  fields?: { path: string }[];
}

const cbc = () => ({
  code: 'cbc',
  category: 'LAB',
  nameEn: 'Complete blood count',
  directlyOrderable: true,
  reportHours: 6,
});

describe('service catalogue and service prices over HTTP', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({ imports: [ServicesTestModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, WEB);
    await app.listen(0, '127.0.0.1');
    client = staffClient(`${await app.getUrl()}/api/v1`, WEB, () => clock.now());
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function staffOf(tenantId: string, permissions: Parameters<typeof grantPermissions>[3]) {
    const user = await seedUser(prisma, { passwordHash });
    const membership = await seedMembership(prisma, tenantId, user.id);
    if (permissions.length > 0) await grantPermissions(prisma, tenantId, membership, permissions);
    return client.sessionOf(user.username, PASSWORD);
  }

  async function hospital() {
    const tenantId = await seedTenant(prisma);
    await seedEntitlements(prisma, tenantId, ['billing']);
    const admin = await staffOf(tenantId, ['admin.price.publish']);
    return { tenantId, admin };
  }

  const post = (session: StaffSession, path: string, body: unknown) =>
    client.call(session, 'POST', path, body, { 'Idempotency-Key': randomUUID() });

  async function ok<T>(res: Response, status = 200): Promise<T> {
    if (res.status !== status)
      throw new Error(`Expected ${status}, got ${res.status}: ${await res.text()}`);
    return (await dataOf(res)) as T;
  }

  const created = async (admin: StaffSession, body: unknown = cbc()) =>
    ok<ServiceRecord>(await client.call(admin, 'POST', '/billing/services', body), 201);

  it('adds a service with an upper-case code, audited, and lists it', async () => {
    const { tenantId, admin } = await hospital();
    const service = await created(admin);
    expect(service).toMatchObject({
      ...cbc(),
      code: 'CBC',
      nameBn: null,
      active: true,
      version: 1,
    });
    const list = await ok<{ services: ServiceRecord[] }>(
      await client.call(admin, 'GET', '/billing/services'),
    );
    expect(list.services.map((row) => row.code)).toEqual(['CBC']);
    const audits = await withTenant(prisma, { tenantId }, (tx) =>
      tx.auditEvent.count({ where: { action: 'billing.service.created' } }),
    );
    expect(audits).toBe(1);
  });

  it('refuses a code in use, a name in no script and a consultation category', async () => {
    const { admin } = await hospital();
    await created(admin);
    const again = await client.call(admin, 'POST', '/billing/services', cbc());
    expect(again.status).toBe(422);
    expect(((await again.json()) as Problem).fields?.map((field) => field.path)).toEqual(['code']);
    const nameless = await client.call(admin, 'POST', '/billing/services', {
      ...cbc(),
      code: 'XR',
      nameEn: null,
    });
    expect(nameless.status).toBe(422);
    const consultation = await client.call(admin, 'POST', '/billing/services', {
      ...cbc(),
      code: 'X1',
      category: 'CONSULTATION',
    });
    expect(consultation.status).toBe(422);
  });

  it('edits at the version shown; the code and category never change', async () => {
    const { admin } = await hospital();
    const service = await created(admin);
    const path = `/billing/services/${service.serviceItemId}`;
    const form = { nameEn: 'CBC', directlyOrderable: false, reportHours: 4, active: true };
    const saved = await ok<ServiceRecord>(
      await client.call(admin, 'PUT', path, { ...form, expectedVersion: 1 }),
    );
    expect(saved).toMatchObject({ ...form, code: 'CBC', category: 'LAB', version: 2 });
    expect((await client.call(admin, 'PUT', path, { ...form, expectedVersion: 1 })).status).toBe(
      409,
    );
    expect(
      (await client.call(admin, 'PUT', path, { ...form, code: 'NEW', expectedVersion: 2 })).status,
    ).toBe(422);
  });

  it('prices a service in the draft, previews it and publishes it', async () => {
    const { admin } = await hospital();
    const service = await created(admin);
    const draft = await ok<PriceList>(await post(admin, '/billing/price-lists', {}), 201);
    const pricePath = `/billing/price-lists/${draft.priceListId}/service-prices/${service.serviceItemId}`;
    const zero = await client.call(
      admin,
      'PUT',
      pricePath,
      { unitPrice: '0.00', expectedVersion: draft.version },
      { 'Idempotency-Key': randomUUID() },
    );
    expect(zero.status).toBe(422);
    const priced = await ok<PriceList>(
      await client.call(
        admin,
        'PUT',
        pricePath,
        { unitPrice: '450.00', expectedVersion: draft.version },
        { 'Idempotency-Key': randomUUID() },
      ),
    );
    expect(priced.servicePrices).toEqual([
      {
        service: {
          serviceItemId: service.serviceItemId,
          code: 'CBC',
          category: 'LAB',
          nameBn: null,
          nameEn: 'Complete blood count',
        },
        unitPrice: '450.00',
      },
    ]);
    expect(priced.servicePriceCount).toBe(1);
    const changes = await ok<PriceListChanges>(
      await client.call(admin, 'GET', `/billing/price-lists/${draft.priceListId}/changes`),
    );
    expect(changes.serviceChanges).toMatchObject([
      { change: 'ADDED', before: null, after: '450.00' },
    ]);
    const published = await ok<PriceList>(
      await post(admin, `/billing/price-lists/${draft.priceListId}/publish`, {
        expectedVersion: priced.version,
      }),
    );
    expect(published).toMatchObject({ status: 'PUBLISHED', inForce: true, servicePriceCount: 1 });

    // The next draft starts from the published prices and can remove one.
    const next = await ok<PriceList>(await post(admin, '/billing/price-lists', {}), 201);
    expect(next.servicePrices).toHaveLength(1);
    const removed = await ok<PriceList>(
      await post(
        admin,
        `/billing/price-lists/${next.priceListId}/service-prices/${service.serviceItemId}/remove`,
        { expectedVersion: next.version },
      ),
    );
    expect(removed.servicePrices).toEqual([]);
  });

  it('refuses a price for an inactive service, and needs admin.price.publish', async () => {
    const { tenantId, admin } = await hospital();
    const service = await created(admin);
    await ok(
      await client.call(admin, 'PUT', `/billing/services/${service.serviceItemId}`, {
        nameEn: 'Complete blood count',
        directlyOrderable: true,
        reportHours: 6,
        active: false,
        expectedVersion: 1,
      }),
    );
    const draft = await ok<PriceList>(await post(admin, '/billing/price-lists', {}), 201);
    const res = await client.call(
      admin,
      'PUT',
      `/billing/price-lists/${draft.priceListId}/service-prices/${service.serviceItemId}`,
      { unitPrice: '10.00', expectedVersion: draft.version },
      { 'Idempotency-Key': randomUUID() },
    );
    expect(res.status).toBe(422);
    const reception = await staffOf(tenantId, ['patient.record.search']);
    expect((await client.call(reception, 'GET', '/billing/services')).status).toBe(403);
  });
});
