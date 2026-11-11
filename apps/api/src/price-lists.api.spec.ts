import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Practitioner, PriceList, PriceListChanges, PriceListList } from '@hms/contracts';
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

// Price lists with doctor fees over real HTTP against PostgreSQL (T-BIL-01; FR-CFG-001, FR-CFG-002,
// FR-BIL-007; C-041; AT-CFG-002; SP-03; FR-AUD-001). "Now" is 10:00 in Dhaka on 2026-11-12. Names
// are synthetic (AS-009).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
const NOW = new Date('2026-11-12T04:00:00Z');
const clock = fixedClock(NOW);

@Module({
  imports: [
    RequestPipelineModule.forRoot({ level: 'silent' }),
    DatabaseModule.forRoot(databaseUrl),
    IdentityAccessModule.forRoot(
      {
        timeouts: { idleMinutes: 60, absoluteHours: 12 },
        csrfSecret: 's'.repeat(32),
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
class PriceListsTestModule {}

interface Problem {
  code: string;
  fields?: { path: string }[];
}

const FEE = { newPatientFee: '500.00', followUpFee: '300.00', followUpDays: 14 };

describe('price lists over HTTP', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({ imports: [PriceListsTestModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, WEB);
    await app.listen(0, '127.0.0.1');
    client = staffClient(`${await app.getUrl()}/api/v1`, WEB, () => clock.now());
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function staffOf(
    tenantId: string,
    permissions: Parameters<typeof grantPermissions>[3],
  ): Promise<StaffSession> {
    const user = await seedUser(prisma, { passwordHash });
    const membership = await seedMembership(prisma, tenantId, user.id);
    if (permissions.length > 0) await grantPermissions(prisma, tenantId, membership, permissions);
    return client.sessionOf(user.username, PASSWORD);
  }

  /** A hospital with an administrator who manages practitioners and publishes prices. */
  async function hospital() {
    const tenantId = await seedTenant(prisma);
    await seedEntitlements(prisma, tenantId, ['patients']);
    const admin = await staffOf(tenantId, ['practitioner.manage', 'admin.price.publish']);
    return { tenantId, admin };
  }

  const idem = () => ({ 'Idempotency-Key': randomUUID() });
  const problemOf = async (res: Response) => (await res.json()) as Problem;

  async function practitioner(admin: StaffSession, nameEn: string): Promise<Practitioner> {
    const res = await client.call(admin, 'POST', '/practitioners', { nameEn }, idem());
    expect(res.status).toBe(201);
    return (await dataOf(res)) as Practitioner;
  }

  async function draft(admin: StaffSession): Promise<PriceList> {
    const res = await client.call(admin, 'POST', '/billing/price-lists', {}, idem());
    expect(res.status).toBe(201);
    return (await dataOf(res)) as PriceList;
  }

  const setFee = (admin: StaffSession, list: PriceList, practitionerId: string, fee = FEE) =>
    client.call(
      admin,
      'PUT',
      `/billing/price-lists/${list.priceListId}/doctor-fees/${practitionerId}`,
      { ...fee, expectedVersion: list.version },
      idem(),
    );

  async function feeSet(admin: StaffSession, list: PriceList, practitionerId: string, fee = FEE) {
    const res = await setFee(admin, list, practitionerId, fee);
    expect(res.status).toBe(200);
    return (await dataOf(res)) as PriceList;
  }

  const publish = (admin: StaffSession, list: PriceList, effectiveFrom?: string) =>
    client.call(
      admin,
      'POST',
      `/billing/price-lists/${list.priceListId}/publish`,
      { expectedVersion: list.version, ...(effectiveFrom ? { effectiveFrom } : {}) },
      idem(),
    );

  async function published(admin: StaffSession, list: PriceList, effectiveFrom?: string) {
    const res = await publish(admin, list, effectiveFrom);
    expect(res.status).toBe(200);
    return (await dataOf(res)) as PriceList;
  }

  it('C-041: drafts, sets a doctor fee, previews and publishes it now', async () => {
    const { tenantId, admin } = await hospital();
    const karim = await practitioner(admin, 'Karim Uddin');
    const choices = await client.call(admin, 'GET', '/billing/price-lists/practitioner-choices');
    expect(await dataOf(choices)).toMatchObject({
      practitioners: [{ practitionerId: karim.practitionerId }],
    });
    const first = await draft(admin);
    expect(first).toMatchObject({ versionNo: 1, status: 'DRAFT', inForce: false, doctorFees: [] });

    const second = await client.call(admin, 'POST', '/billing/price-lists', {}, idem());
    expect((await problemOf(second)).code).toBe('INVALID_TRANSITION');

    const edited = await feeSet(admin, first, karim.practitionerId);
    expect(edited.version).toBe(2);
    expect(edited.doctorFees).toEqual([
      { practitioner: expect.objectContaining({ nameEn: 'Karim Uddin' }), ...FEE },
    ]);

    const preview = await client.call(
      admin,
      'GET',
      `/billing/price-lists/${first.priceListId}/changes`,
    );
    const changes = (await dataOf(preview)) as PriceListChanges;
    expect(changes).toMatchObject({ comparedWithVersionNo: null, changes: [{ change: 'ADDED' }] });

    const live = await published(admin, edited);
    expect(live).toMatchObject({
      status: 'PUBLISHED',
      inForce: true,
      effectiveFrom: NOW.toISOString(),
      doctorFeeCount: 1,
    });
    const audit = await withTenant(prisma, { tenantId }, (tx) =>
      tx.auditEvent.findFirst({ where: { action: 'billing.price_list.published' } }),
    );
    expect(audit?.details).toMatchObject({ versionNo: 1, added: 1, changed: 0, removed: 0 });
  });

  it('FR-CFG-002: a new draft copies the prices; a future version is not in force yet', async () => {
    const { admin } = await hospital();
    const karim = await practitioner(admin, 'Karim Uddin');
    await published(admin, await feeSet(admin, await draft(admin), karim.practitionerId));

    const next = await draft(admin);
    expect(next.versionNo).toBe(2);
    expect(next.doctorFees[0]).toMatchObject(FEE);
    const raised = await feeSet(admin, next, karim.practitionerId, {
      ...FEE,
      newPatientFee: '600.00',
    });
    const preview = await client.call(
      admin,
      'GET',
      `/billing/price-lists/${next.priceListId}/changes`,
    );
    expect((await dataOf(preview)) as PriceListChanges).toMatchObject({
      comparedWithVersionNo: 1,
      changes: [{ change: 'CHANGED', before: FEE, after: { newPatientFee: '600.00' } }],
    });

    await published(admin, raised, '2026-11-13T00:00:00+06:00');
    const res = await client.call(admin, 'GET', '/billing/price-lists');
    const { priceLists } = (await dataOf(res)) as PriceListList;
    expect(priceLists.map((list) => [list.versionNo, list.inForce])).toEqual([
      [2, false],
      [1, true],
    ]);
  });

  it('refuses a zero fee, a past time, an inactive doctor, a stale edit', async () => {
    const { admin } = await hospital();
    const karim = await practitioner(admin, 'Karim Uddin');
    const list = await draft(admin);

    const zero = await setFee(admin, list, karim.practitionerId, { ...FEE, followUpFee: '0.00' });
    expect(zero.status).toBe(422);
    expect((await problemOf(zero)).fields?.[0]?.path).toBe('followUpFee');

    const nobody = await setFee(admin, list, randomUUID());
    expect((await problemOf(nobody)).fields?.[0]?.path).toBe('practitionerId');

    const edited = await feeSet(admin, list, karim.practitionerId);
    const stale = await setFee(admin, list, karim.practitionerId);
    expect((await problemOf(stale)).code).toBe('STALE_RECORD');

    const past = await publish(admin, edited, '2026-11-11T10:00:00+06:00');
    expect((await problemOf(past)).fields?.[0]?.path).toBe('effectiveFrom');
  });

  it('removes a fee from the draft; a published version cannot change', async () => {
    const { tenantId, admin } = await hospital();
    const karim = await practitioner(admin, 'Karim Uddin');
    const live = await published(
      admin,
      await feeSet(admin, await draft(admin), karim.practitionerId),
    );

    const again = await setFee(admin, live, karim.practitionerId);
    expect((await problemOf(again)).code).toBe('INVALID_TRANSITION');

    // AT-CFG-002: even a direct write by the app's database role is refused.
    await expect(
      withTenant(prisma, { tenantId }, (tx) =>
        tx.priceListItem.updateMany({
          where: { priceListVersionId: live.priceListId },
          data: { unitPrice: '1.00' },
        }),
      ),
    ).rejects.toThrow(/published price list/);

    const next = await draft(admin);
    const res = await client.call(
      admin,
      'POST',
      `/billing/price-lists/${next.priceListId}/doctor-fees/${karim.practitionerId}/remove`,
      { expectedVersion: next.version },
      idem(),
    );
    expect(res.status).toBe(200);
    expect(((await dataOf(res)) as PriceList).doctorFees).toEqual([]);
  });

  it("needs admin.price.publish and hides another hospital's price lists", async () => {
    const { tenantId, admin } = await hospital();
    const list = await draft(admin);
    const reception = await staffOf(tenantId, ['patient.record.search']);
    expect((await client.call(reception, 'GET', '/billing/price-lists')).status).toBe(403);

    const other = await hospital();
    const res = await client.call(other.admin, 'GET', `/billing/price-lists/${list.priceListId}`);
    expect(res.status).toBe(404);
  });
});
