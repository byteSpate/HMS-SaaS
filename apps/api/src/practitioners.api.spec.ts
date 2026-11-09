import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Practitioner } from '@hms/contracts';
import { createPrismaClient, withTenant, type PrismaClient } from '@hms/database';
import { fixedClock } from '@hms/domain-kernel';
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

// Practitioner master over real HTTP against PostgreSQL (T-PRA-01; FR-PRA-001..003; AT-PRA-001;
// SP-03; FR-AUD-001). Names are synthetic (AS-009).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
const clock = fixedClock(new Date('2026-11-08T06:00:00Z'));

@Module({
  imports: [
    RequestPipelineModule.forRoot({ level: 'silent' }),
    DatabaseModule.forRoot(databaseUrl),
    IdentityAccessModule.forRoot(
      {
        timeouts: { idleMinutes: 60, absoluteHours: 12 },
        csrfSecret: 'p'.repeat(32),
        lockout: { maxFailedAttempts: 5, lockMinutes: 15 },
        loginRateLimits: DEFAULT_LOGIN_RATE_LIMITS,
        mfa: { encryptionKey: Buffer.alloc(32, 7), issuer: 'HMS test' },
      },
      clock,
      { allowedOrigins: [WEB] },
    ),
    PatientsModule.forRoot({ clock, nidKey: Buffer.alloc(32, 9) }),
  ],
})
class PractitionersTestModule {}

interface Problem {
  code: string;
  fields?: { path: string }[];
}

/** The editable part of a practitioner, as the edit form sends it back. */
function formOf(practitioner: Practitioner) {
  return {
    nameBn: practitioner.nameBn,
    nameEn: practitioner.nameEn,
    degrees: practitioner.degrees,
    specialty: practitioner.specialty,
    phone: practitioner.phone,
    registrationNo: practitioner.registrationNo,
    active: practitioner.active,
  };
}

describe('practitioner master over HTTP', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({
      imports: [PractitionersTestModule],
    }).compile();
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

  /** A hospital with the patients module and an administrator who manages practitioners. */
  async function hospital() {
    const tenantId = await seedTenant(prisma);
    await seedEntitlements(prisma, tenantId, ['patients']);
    const admin = await staffOf(tenantId, ['practitioner.manage']);
    return { tenantId, admin };
  }

  const karim = () => ({
    nameEn: 'Karim Uddin',
    nameBn: '\u0995\u09B0\u09BF\u09AE \u0989\u09A6\u09CD\u09A6\u09BF\u09A8',
    degrees: 'MBBS, FCPS (Medicine)',
    specialty: 'Medicine',
    phone: '01711000001',
    registrationNo: 'A-12345',
  });

  const create = (session: StaffSession, body: unknown, key: string = randomUUID()) =>
    client.call(session, 'POST', '/practitioners', body, { 'Idempotency-Key': key });

  const update = (session: StaffSession, id: string, body: unknown) =>
    client.call(session, 'PUT', `/practitioners/${id}`, body, { 'Idempotency-Key': randomUUID() });

  async function list(session: StaffSession): Promise<Practitioner[]> {
    const res = await client.call(session, 'GET', '/practitioners');
    return ((await dataOf(res)) as { practitioners: Practitioner[] }).practitioners;
  }

  async function created(session: StaffSession, body: unknown = karim()): Promise<Practitioner> {
    const res = await create(session, body);
    expect(res.status).toBe(201);
    return (await dataOf(res)) as Practitioner;
  }

  it('creates a practitioner with an audit event and an outbox event', async () => {
    const { tenantId, admin } = await hospital();
    const practitioner = await created(admin);
    expect(practitioner).toMatchObject({ ...karim(), active: true, version: 1 });

    const [audits, events] = await withTenant(prisma, { tenantId }, (tx) =>
      Promise.all([
        tx.auditEvent.findMany({
          where: { action: 'practitioner.created', targetId: practitioner.practitionerId },
        }),
        tx.outboxEvent.findMany({
          where: { eventType: 'PractitionerChanged', aggregateId: practitioner.practitionerId },
        }),
      ]),
    );
    expect(audits).toHaveLength(1);
    expect(events).toHaveLength(1);
  });

  it('AT-PRA-001: allows two practitioners with the same name; a new one is listed at once', async () => {
    const { admin } = await hospital();
    const first = await created(admin);
    const second = await created(admin, { ...karim(), specialty: 'Cardiology' });
    expect(second.practitionerId).not.toBe(first.practitionerId);

    const listed = await list(admin);
    expect(listed.map((row) => row.practitionerId).sort()).toEqual(
      [first.practitionerId, second.practitionerId].sort(),
    );
  });

  it('needs a name in Bangla or English and refuses unknown fields', async () => {
    const { admin } = await hospital();
    const nameless = await create(admin, { specialty: 'Medicine' });
    expect(nameless.status).toBe(422);
    expect(((await nameless.json()) as Problem).fields?.map((field) => field.path)).toEqual([
      'nameEn',
    ]);

    const bnOnly = await created(admin, { nameBn: karim().nameBn });
    expect(bnOnly.nameEn).toBeNull();

    const extra = await create(admin, { ...karim(), departmentId: randomUUID() });
    expect(extra.status).toBe(422);
  });

  it('a retry with the same Idempotency-Key returns the same practitioner', async () => {
    const { admin } = await hospital();
    const key = randomUUID();
    const first = await create(admin, karim(), key);
    const again = await create(admin, karim(), key);
    expect(again.status).toBe(201);
    expect(again.headers.get('Idempotent-Replay')).toBe('true');
    expect(await dataOf(again)).toEqual(await dataOf(first));
    expect(await list(admin)).toHaveLength(1);
  });

  it('edits, clears a field and deactivates, with the changed fields audited', async () => {
    const { tenantId, admin } = await hospital();
    const practitioner = await created(admin);
    const res = await update(admin, practitioner.practitionerId, {
      ...formOf(practitioner),
      phone: null,
      specialty: 'Internal medicine',
      active: false,
      expectedVersion: 1,
    });
    expect(res.status).toBe(200);
    expect(await dataOf(res)).toMatchObject({
      phone: null,
      specialty: 'Internal medicine',
      active: false,
      version: 2,
    });

    const audit = await withTenant(prisma, { tenantId }, (tx) =>
      tx.auditEvent.findFirstOrThrow({
        where: { action: 'practitioner.changed', targetId: practitioner.practitionerId },
      }),
    );
    expect(audit.details).toMatchObject({
      changedFields: 'specialty,phone,active',
      fromVersion: 1,
      toVersion: 2,
    });
  });

  it('SP-03: a stale version is STALE_RECORD; an edit that changes nothing is refused', async () => {
    const { admin } = await hospital();
    const practitioner = await created(admin);
    const form = formOf(practitioner);

    const stale = await update(admin, practitioner.practitionerId, {
      ...form,
      specialty: 'Surgery',
      expectedVersion: 2,
    });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as Problem).code).toBe('STALE_RECORD');

    const same = await update(admin, practitioner.practitionerId, {
      ...form,
      expectedVersion: 1,
    });
    expect(same.status).toBe(422);

    const [unchanged] = await list(admin);
    expect(unchanged).toMatchObject({ specialty: 'Medicine', version: 1 });
  });

  it('keeps each hospital to its own practitioners (RLS)', async () => {
    const first = await hospital();
    const second = await hospital();
    const theirs = await created(first.admin);

    expect(await list(second.admin)).toEqual([]);
    const read = await client.call(second.admin, 'GET', `/practitioners/${theirs.practitionerId}`);
    expect(read.status).toBe(404);
    const edit = await update(second.admin, theirs.practitionerId, {
      ...formOf(theirs),
      specialty: 'Surgery',
      expectedVersion: theirs.version,
    });
    expect(edit.status).toBe(404);
  });

  it('needs practitioner.manage and the patients module', async () => {
    const { tenantId } = await hospital();
    const receptionist = await staffOf(tenantId, ['patient.record.search']);
    const denied = await create(receptionist, karim());
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as Problem).code).toBe('PERMISSION_DENIED');
    const deniedList = await client.call(receptionist, 'GET', '/practitioners');
    expect(deniedList.status).toBe(403);

    const noModule = await seedTenant(prisma);
    const admin = await staffOf(noModule, ['practitioner.manage']);
    const missing = await create(admin, karim());
    expect(((await missing.json()) as Problem).code).toBe('ENTITLEMENT_MISSING');
  });

  it('the app cannot delete a practitioner or rewrite who created it', async () => {
    const { tenantId, admin } = await hospital();
    const practitioner = await created(admin);
    await expect(
      withTenant(prisma, { tenantId }, (tx) =>
        tx.practitioner.delete({ where: { id: practitioner.practitionerId } }),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withTenant(prisma, { tenantId }, (tx) =>
        tx.practitioner.update({
          where: { id: practitioner.practitionerId },
          data: { createdBy: randomUUID() },
        }),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
