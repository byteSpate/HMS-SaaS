import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { DepartmentRecord } from '@hms/contracts';
import { createPrismaClient, withTenant, type PrismaClient } from '@hms/database';
import { fixedClock } from '@hms/domain-kernel';
import {
  DEFAULT_LOGIN_RATE_LIMITS,
  hashPassword,
  IdentityAccessModule,
} from '@hms/mod-identity-access';
import { DatabaseModule, RequestPipelineModule } from '@hms/platform';
import {
  dataOf,
  grantPermissions,
  seedMembership,
  seedTenant,
  seedUser,
  staffClient,
  type StaffClient,
  type StaffSession,
} from '@hms/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from './http/configure-app.js';

// Department master over real HTTP against PostgreSQL (T-PRA-02; FR-CFG-001, FR-I18N-006; SP-03;
// FR-AUD-001). Names are synthetic (AS-009).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
const clock = fixedClock(new Date('2026-11-09T06:00:00Z'));

@Module({
  imports: [
    RequestPipelineModule.forRoot({ level: 'silent' }),
    DatabaseModule.forRoot(databaseUrl),
    IdentityAccessModule.forRoot(
      {
        timeouts: { idleMinutes: 60, absoluteHours: 12 },
        csrfSecret: 'd'.repeat(32),
        lockout: { maxFailedAttempts: 5, lockMinutes: 15 },
        loginRateLimits: DEFAULT_LOGIN_RATE_LIMITS,
        mfa: { encryptionKey: Buffer.alloc(32, 7), issuer: 'HMS test' },
      },
      clock,
      { allowedOrigins: [WEB] },
    ),
  ],
})
class DepartmentsTestModule {}

interface Problem {
  code: string;
  fields?: { path: string }[];
}

/** The editable part of a department, as the edit form sends it back. */
function formOf(department: DepartmentRecord) {
  return {
    code: department.code,
    nameBn: department.nameBn,
    nameEn: department.nameEn,
    active: department.active,
  };
}

describe('department master over HTTP', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({
      imports: [DepartmentsTestModule],
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

  /** A hospital with an administrator who may change its configuration. */
  async function hospital() {
    const tenantId = await seedTenant(prisma);
    const admin = await staffOf(tenantId, ['admin.config.publish']);
    return { tenantId, admin };
  }

  const medicine = () => ({
    code: 'med',
    nameEn: 'Medicine',
    nameBn: String.fromCharCode(0x09ae, 0x09c7, 0x09a1, 0x09bf, 0x09b8, 0x09bf, 0x09a8),
  });

  const create = (session: StaffSession, body: unknown) =>
    client.call(session, 'POST', '/admin/departments', body);

  const update = (session: StaffSession, id: string, body: unknown) =>
    client.call(session, 'PUT', `/admin/departments/${id}`, body);

  async function list(session: StaffSession): Promise<DepartmentRecord[]> {
    const res = await client.call(session, 'GET', '/admin/departments');
    return ((await dataOf(res)) as { departments: DepartmentRecord[] }).departments;
  }

  async function created(
    session: StaffSession,
    body: unknown = medicine(),
  ): Promise<DepartmentRecord> {
    const res = await create(session, body);
    expect(res.status).toBe(201);
    return (await dataOf(res)) as DepartmentRecord;
  }

  const fieldsOf = async (res: Response) =>
    ((await res.json()) as Problem).fields?.map((field) => field.path);

  it('creates a department with an upper-case code, an audit event and an outbox event', async () => {
    const { tenantId, admin } = await hospital();
    const department = await created(admin);
    expect(department).toMatchObject({ ...medicine(), code: 'MED', active: true, version: 1 });
    expect(await list(admin)).toEqual([department]);

    const [audits, events, facilities] = await withTenant(prisma, { tenantId }, (tx) =>
      Promise.all([
        tx.auditEvent.findMany({
          where: { action: 'department.created', targetId: department.departmentId },
        }),
        tx.outboxEvent.findMany({
          where: { eventType: 'DepartmentChanged', aggregateId: department.departmentId },
        }),
        tx.facility.findMany(),
      ]),
    );
    expect(audits).toHaveLength(1);
    expect(events).toHaveLength(1);
    // C-024: the first department gave the hospital its one facility; the second reuses it.
    await created(admin, { code: 'OBG', nameEn: 'Obstetrics and gynaecology' });
    const after = await withTenant(prisma, { tenantId }, (tx) => tx.facility.findMany());
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(facilities[0]?.id);
  });

  it('refuses a code already used in the hospital, but not in another hospital', async () => {
    const first = await hospital();
    await created(first.admin);
    const again = await create(first.admin, { code: ' MED ', nameEn: 'Medicine two' });
    expect(again.status).toBe(422);
    expect(await fieldsOf(again)).toEqual(['code']);

    const second = await hospital();
    await created(second.admin);
  });

  it('needs a code of letters, digits or hyphens and a name in Bangla or English', async () => {
    const { admin } = await hospital();
    const nameless = await create(admin, { code: 'ENT' });
    expect(nameless.status).toBe(422);
    expect(await fieldsOf(nameless)).toEqual(['nameEn']);

    const badCode = await create(admin, { code: '1 MED', nameEn: 'Medicine' });
    expect(await fieldsOf(badCode)).toEqual(['code']);

    const bnOnly = await created(admin, { code: 'ENT', nameBn: medicine().nameBn });
    expect(bnOnly.nameEn).toBeNull();

    const extra = await create(admin, { ...medicine(), facilityId: randomUUID() });
    expect(extra.status).toBe(422);
  });

  it('edits the code and names and deactivates, with the changed fields audited', async () => {
    const { tenantId, admin } = await hospital();
    const department = await created(admin);
    const res = await update(admin, department.departmentId, {
      ...formOf(department),
      code: 'IM',
      nameBn: null,
      active: false,
      expectedVersion: 1,
    });
    expect(res.status).toBe(200);
    expect(await dataOf(res)).toMatchObject({
      code: 'IM',
      nameBn: null,
      active: false,
      version: 2,
    });

    const audit = await withTenant(prisma, { tenantId }, (tx) =>
      tx.auditEvent.findFirstOrThrow({
        where: { action: 'department.changed', targetId: department.departmentId },
      }),
    );
    expect(audit.details).toMatchObject({
      changedFields: 'code,nameBn,active',
      fromVersion: 1,
      toVersion: 2,
    });
  });

  it('refuses an edit to a code another department has', async () => {
    const { admin } = await hospital();
    await created(admin);
    const gynae = await created(admin, { code: 'OBG', nameEn: 'Gynaecology' });
    const res = await update(admin, gynae.departmentId, {
      ...formOf(gynae),
      code: 'MED',
      expectedVersion: 1,
    });
    expect(res.status).toBe(422);
    expect(await fieldsOf(res)).toEqual(['code']);
  });

  it('SP-03: a stale version is STALE_RECORD; an edit that changes nothing is refused', async () => {
    const { admin } = await hospital();
    const department = await created(admin);
    const form = formOf(department);

    const stale = await update(admin, department.departmentId, {
      ...form,
      nameEn: 'Internal medicine',
      expectedVersion: 2,
    });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as Problem).code).toBe('STALE_RECORD');

    const same = await update(admin, department.departmentId, { ...form, expectedVersion: 1 });
    expect(same.status).toBe(422);

    const [unchanged] = await list(admin);
    expect(unchanged).toMatchObject({ nameEn: 'Medicine', version: 1 });
  });

  it('keeps each hospital to its own departments (RLS)', async () => {
    const first = await hospital();
    const second = await hospital();
    const theirs = await created(first.admin);

    expect(await list(second.admin)).toEqual([]);
    const read = await client.call(
      second.admin,
      'GET',
      `/admin/departments/${theirs.departmentId}`,
    );
    expect(read.status).toBe(404);
    const edit = await update(second.admin, theirs.departmentId, {
      ...formOf(theirs),
      nameEn: 'Surgery',
      expectedVersion: theirs.version,
    });
    expect(edit.status).toBe(404);
  });

  it('needs admin.config.publish', async () => {
    const { tenantId } = await hospital();
    const receptionist = await staffOf(tenantId, ['patient.record.search']);
    const denied = await create(receptionist, medicine());
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as Problem).code).toBe('PERMISSION_DENIED');
    const deniedList = await client.call(receptionist, 'GET', '/admin/departments');
    expect(deniedList.status).toBe(403);
  });

  it('the app cannot delete a department or rewrite who created it', async () => {
    const { tenantId, admin } = await hospital();
    const department = await created(admin);
    await expect(
      withTenant(prisma, { tenantId }, (tx) =>
        tx.department.delete({ where: { id: department.departmentId } }),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withTenant(prisma, { tenantId }, (tx) =>
        tx.department.update({
          where: { id: department.departmentId },
          data: { createdBy: randomUUID() },
        }),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
