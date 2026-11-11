'use client';
// A patient's appointments on the patient record (T-SCH-02; UC-SCH-01/02): every booking in
// session order, with the action to book a new one. Needs scheduling.appointment.book; the page
// shows this section only to someone who has it, and the API enforces it.
import { Alert, Button, Skeleton } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { APPOINTMENTS_QUERY_KEY, appointmentsApi } from '../../api/appointments';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { AppointmentTable } from './appointment-table';
import { BookDialog } from './book-dialog';

export function PatientAppointments({ patientId }: { patientId: string }) {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const [booking, setBooking] = useState(false);
  const appointments = useQuery({
    queryKey: [...APPOINTMENTS_QUERY_KEY, 'patient', patientId],
    queryFn: () => appointmentsApi.ofPatient(patientId),
  });

  return (
    <section className="flex max-w-3xl flex-col gap-3" aria-labelledby="patient-appointments">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="patient-appointments" className="text-lg font-semibold">
          {t('appointments.sectionTitle')}
        </h2>
        <Button onClick={() => setBooking(true)}>{t('appointments.book')}</Button>
      </div>
      {appointments.error ? <Alert tone="danger">{errorMessage(appointments.error)}</Alert> : null}
      {appointments.isPending ? <Skeleton className="h-24" /> : null}
      {appointments.data?.length === 0 ? (
        <p className="text-sm text-text-muted">{t('appointments.empty')}</p>
      ) : null}
      {appointments.data && appointments.data.length > 0 ? (
        <AppointmentTable appointments={appointments.data} by="session" />
      ) : null}
      {booking ? <BookDialog patientId={patientId} onOpenChange={setBooking} /> : null}
    </section>
  );
}
