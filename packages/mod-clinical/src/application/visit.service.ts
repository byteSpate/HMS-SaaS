// Check-in (T-VIS-01; UC-VIS-01; FR-VIS-002, FR-VIS-004, FR-VIS-005, FR-SCH-004, FR-BIL-010;
// C-007, C-008, C-035, C-041; FR-AUD-001). In one transaction: the appointment becomes CHECKED_IN
// with the session's next serial number (scheduling), the OPD_CONSULTATION visit is created
// (this module), and the doctor-fee invoice is issued (billing). With no fee configured the visit
// is still created and the answer says POLICY_NOT_CONFIGURED (A1). A double click is one visit
// through the Idempotency-Key (R1); a second receptionist with another key gets STALE_RECORD (R2).
import { Inject, Injectable } from '@nestjs/common';
import type { CheckInRequest, VisitCheckIn } from '@hms/contracts';
import { withTenant, type PrismaClient } from '@hms/database';
import { DomainError, type Clock } from '@hms/domain-kernel';
import { issueDoctorFee } from '@hms/mod-billing';
import { hospitalFacilityId } from '@hms/mod-identity-access';
import { findPractitionerChoices } from '@hms/mod-patients';
import { checkInAppointment } from '@hms/mod-scheduling';
import { PRISMA, recordChange, requestScope } from '@hms/platform';
import { insertConsultationVisit, lastConsultationAt } from '../infrastructure/visit.repository.js';
import { CLINICAL_CLOCK } from './context.js';

@Injectable()
export class VisitService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLINICAL_CLOCK) private readonly clock: Clock,
  ) {}

  checkIn(request: CheckInRequest): Promise<VisitCheckIn> {
    const scope = requestScope();
    const now = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      const appointment = await checkInAppointment(tx, scope, request, now);
      const practitioner = (await findPractitionerChoices(tx, [appointment.practitionerId])).get(
        appointment.practitionerId,
      );
      if (!practitioner) throw new DomainError('NOT_FOUND', 'Practitioner not found');
      // Read before this visit exists, so the last consultation is an earlier one (C-041).
      const lastConsultation = await lastConsultationAt(
        tx,
        appointment.patientId,
        appointment.practitionerId,
      );
      const visit = await insertConsultationVisit(tx, {
        tenantId: scope.tenantId,
        facilityId: await hospitalFacilityId(tx, scope.tenantId),
        // AS-015: the visit's department is the doctor's.
        departmentId: practitioner.department?.departmentId ?? null,
        patientId: appointment.patientId,
        practitionerId: appointment.practitionerId,
        appointmentId: appointment.appointmentId,
        sessionId: appointment.sessionId,
        queueNumber: appointment.queueNumber,
        userId: scope.userId,
        at: now,
      });
      const doctorFee = await issueDoctorFee(
        tx,
        scope,
        {
          visitId: visit.id,
          patientId: appointment.patientId,
          practitionerId: appointment.practitionerId,
          arrivedAt: visit.arrivedAt,
          lastConsultationAt: lastConsultation,
        },
        now,
      );
      await recordChange(tx, scope, {
        action: 'visit.checked_in',
        eventType: 'VisitCheckedIn',
        targetType: 'visit',
        targetId: visit.id,
        details: {
          appointmentId: appointment.appointmentId,
          sessionId: appointment.sessionId,
          queueNumber: appointment.queueNumber,
          doctorFee: doctorFee.status,
          invoiceId: doctorFee.status === 'ISSUED' ? doctorFee.invoice.invoiceId : null,
        },
      });
      return {
        visitId: visit.id,
        appointmentId: appointment.appointmentId,
        patientId: appointment.patientId,
        kind: 'OPD_CONSULTATION',
        status: visit.status as VisitCheckIn['status'],
        practitioner,
        queueNumber: appointment.queueNumber,
        arrivedAt: visit.arrivedAt.toISOString(),
        doctorFee,
      };
    });
  }
}
