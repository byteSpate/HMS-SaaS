// An outpatient hospital over HTTP for API integration tests (T-VIS-01, T-BIL-04, T-CLI-03;
// AS-009): a doctor with a published fee, a session today, patients, bookings and check-ins, all
// through the real routes, so the invoices a test pays are the ones check-in really issues. A
// doctor may have a staff account of their own (FR-PRA-003) and a paid fee, to open a
// consultation. Synthetic data.
import { randomUUID } from 'node:crypto';
import type { PermissionCode } from '@hms/contracts';
import type { PrismaClient } from '@hms/database';
import {
  grantPermissions,
  seedEntitlements,
  seedMembership,
  seedTenant,
  seedUser,
} from './identity.js';
import { dataOf, type StaffClient, type StaffSession } from './staff-client.js';

export interface CheckedInVisit {
  visitId: string;
  patientId: string;
  /** The doctor-fee invoice check-in issued. */
  invoiceId: string;
}

export interface OpdWorldOptions {
  prisma: PrismaClient;
  client: StaffClient;
  password: string;
  passwordHash: string;
  /** The session date, the hospital's "today" in the test clock (YYYY-MM-DD). */
  today: string;
}

let phoneCounter = 0;

async function answerOf<T>(res: Response, status = 201): Promise<T> {
  if (res.status !== status) {
    throw new Error(`Expected ${status} from the API, got ${res.status}: ${await res.text()}`);
  }
  return (await dataOf(res)) as T;
}

/** A hospital with billing, scheduling, patients and clinical, and a way to make staff. */
export async function createOpdWorld(options: OpdWorldOptions) {
  const { prisma, client, password, passwordHash } = options;
  const tenantId = await seedTenant(prisma);
  await seedEntitlements(prisma, tenantId, ['patients', 'scheduling', 'clinical', 'billing']);

  async function accountOf(
    permissions: readonly PermissionCode[],
  ): Promise<{ userId: string; session: StaffSession }> {
    const user = await seedUser(prisma, { passwordHash });
    const membership = await seedMembership(prisma, tenantId, user.id);
    if (permissions.length > 0) await grantPermissions(prisma, tenantId, membership, permissions);
    return { userId: user.id, session: await client.sessionOf(user.username, password) };
  }

  async function staffOf(permissions: readonly PermissionCode[]): Promise<StaffSession> {
    return (await accountOf(permissions)).session;
  }

  const post = (session: StaffSession, path: string, body: unknown) =>
    client.call(session, 'POST', path, body, { 'Idempotency-Key': randomUUID() });

  const admin = await staffOf(['practitioner.manage', 'admin.price.publish']);
  const reception = await staffOf([
    'scheduling.schedule.manage',
    'scheduling.appointment.book',
    'patient.record.register',
    'visit.checkin',
  ]);

  /**
   * Doctors with their new-patient fee, all in one published price list version. `userIds` links
   * a doctor to a staff account (FR-PRA-003), in the same order as the fees.
   */
  async function doctors(
    fees: readonly string[],
    userIds: readonly (string | undefined)[] = [],
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const [index] of fees.entries()) {
      const userId = userIds[index];
      const doctor = await answerOf<{ practitionerId: string }>(
        await post(admin, '/practitioners', {
          nameEn: `Doctor ${index + 1}`,
          ...(userId ? { userId } : {}),
        }),
      );
      ids.push(doctor.practitionerId);
    }
    let draft = await answerOf<{ priceListId: string; version: number }>(
      await post(admin, '/billing/price-lists', {}),
    );
    for (const [index, fee] of fees.entries()) {
      draft = await answerOf(
        await client.call(
          admin,
          'PUT',
          `/billing/price-lists/${draft.priceListId}/doctor-fees/${ids[index]}`,
          {
            newPatientFee: fee,
            followUpFee: fee,
            followUpDays: 14,
            expectedVersion: draft.version,
          },
          { 'Idempotency-Key': randomUUID() },
        ),
        200,
      );
    }
    await answerOf(
      await post(admin, `/billing/price-lists/${draft.priceListId}/publish`, {
        expectedVersion: draft.version,
      }),
      200,
    );
    return ids;
  }

  async function patient(nameEn = 'Salma Begum'): Promise<string> {
    const { patientId } = await answerOf<{ patientId: string }>(
      await post(reception, '/patients', {
        nameEn,
        sex: 'FEMALE',
        birthDate: '1990-05-14',
        phone: `0171500${String(phoneCounter++ % 10_000).padStart(4, '0')}`,
        confirmNewDespiteCandidates: true,
        shownCandidateIds: [],
      }),
    );
    return patientId;
  }

  // One published session per doctor today: a doctor cannot have two sessions at one time.
  const sessions = new Map<string, string>();
  async function sessionOf(practitionerId: string): Promise<string> {
    const known = sessions.get(practitionerId);
    if (known) return known;
    const draft = await answerOf<{ sessionId: string }>(
      await post(reception, '/schedule-sessions', {
        practitionerId,
        sessionDate: options.today,
        startTime: '17:00',
        endTime: '21:00',
        capacity: 10,
      }),
    );
    await answerOf(
      await post(reception, `/schedule-sessions/${draft.sessionId}/publish`, {
        expectedVersion: 1,
      }),
      200,
    );
    sessions.set(practitionerId, draft.sessionId);
    return draft.sessionId;
  }

  /** Books the patient into the doctor's session today and checks them in. */
  async function checkIn(practitionerId: string, patientId: string): Promise<CheckedInVisit> {
    const sessionId = await sessionOf(practitionerId);
    const appointment = await answerOf<{ appointmentId: string; version: number }>(
      await post(reception, '/appointments', { patientId, sessionId }),
    );
    const visit = await answerOf<{
      visitId: string;
      doctorFee: { status: string; invoice?: { invoiceId: string } };
    }>(
      await post(reception, '/visits/check-in', {
        appointmentId: appointment.appointmentId,
        expectedVersion: appointment.version,
      }),
    );
    if (!visit.doctorFee.invoice) throw new Error('Check-in issued no doctor-fee invoice');
    return { visitId: visit.visitId, patientId, invoiceId: visit.doctorFee.invoice.invoiceId };
  }

  /**
   * Doctors signed in with their own accounts, one per permission set, priced in one published
   * price list version (a second version at the same instant is refused).
   */
  async function signedInDoctors(
    permissionSets: readonly (readonly PermissionCode[])[],
    fee = '500.00',
  ): Promise<{ practitionerId: string; session: StaffSession }[]> {
    const accounts = [];
    for (const permissions of permissionSets) accounts.push(await accountOf(permissions));
    const ids = await doctors(
      accounts.map(() => fee),
      accounts.map((account) => account.userId),
    );
    return accounts.map((account, index) => {
      const practitionerId = ids[index];
      if (!practitionerId) throw new Error('No doctor');
      return { practitionerId, session: account.session };
    });
  }

  /** One doctor signed in with their own account and the given permissions. */
  async function signedInDoctor(
    permissions: readonly PermissionCode[],
    fee = '500.00',
  ): Promise<{ practitionerId: string; session: StaffSession }> {
    const [doctor] = await signedInDoctors([permissions], fee);
    if (!doctor) throw new Error('No doctor');
    return doctor;
  }

  // A cashier with an open session, made on first use.
  let cashier: StaffSession | undefined;
  async function cashierOf(): Promise<StaffSession> {
    if (cashier) return cashier;
    cashier = await staffOf([
      'billing.cashier_session.manage',
      'billing.payment.record',
      'billing.invoice.issue',
    ]);
    await answerOf(await post(cashier, '/billing/cashier-sessions', { openingFloat: '0.00' }));
    return cashier;
  }

  /** The cashier takes the whole doctor fee, so the doctor may start the consultation. */
  async function payDoctorFee(visit: CheckedInVisit): Promise<void> {
    const desk = await cashierOf();
    const invoice = await answerOf<{ balance: string; lines: { lineId: string }[] }>(
      await client.call(desk, 'GET', `/billing/invoices/${visit.invoiceId}`),
      200,
    );
    const line = invoice.lines[0];
    if (!line) throw new Error('The doctor-fee invoice has no line');
    await answerOf(
      await post(desk, '/billing/payments', {
        patientId: visit.patientId,
        method: 'CASH',
        amount: invoice.balance,
        allocations: [{ lineId: line.lineId, amount: invoice.balance }],
      }),
    );
  }

  /** Checks the patient in, pays the fee and starts the consultation as the doctor. */
  async function consultation(
    doctor: { practitionerId: string; session: StaffSession },
    patientId: string,
  ): Promise<{ consultationId: string; visit: CheckedInVisit }> {
    const visit = await checkIn(doctor.practitionerId, patientId);
    await payDoctorFee(visit);
    const started = await answerOf<{ consultationId: string }>(
      await post(doctor.session, `/visits/${visit.visitId}/consultation/start`, {
        expectedVersion: 1,
      }),
    );
    return { consultationId: started.consultationId, visit };
  }

  return {
    tenantId,
    staffOf,
    doctors,
    patient,
    checkIn,
    signedInDoctor,
    signedInDoctors,
    payDoctorFee,
    consultation,
  };
}
