'use client';
// SCR-02 front desk (W-01; T-PAT-01, T-PAT-02; UC-PAT-01): one search for a phone number, MRN, NID
// or name, the matches with their banner fields, and a new registration. Seeing it needs
// patient.record.search and registering patient.record.register; the API checks both again.
import { PageLayout, Button, Field, TextInput } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { patientQueryKeys, patientsApi } from '../../../src/api/patients';
import {
  CELL,
  HEAD_CELL,
  ROW,
  ROW_TITLE,
  TABLE,
  TABLE_FRAME,
} from '../../../src/components/admin/admin-table';
import { displayName, usePatientText } from '../../../src/components/patients/patient-text';
import { RegistrationDialog } from '../../../src/components/patients/registration-dialog';
import { useDebouncedValue } from '../../../src/components/patients/use-debounced-value';
import { QueryView } from '../../../src/components/query-view';
import { useCachedSession } from '../../../src/session/use-session';

const MATCHED_BY_KEYS = {
  MRN: 'patients.matchedByMrn',
  PHONE: 'patients.matchedByPhone',
  NID: 'patients.matchedByNid',
  NAME: 'patients.matchedByName',
} as const;

/** Digits search as typed (phone, MRN, NID); a name needs three letters, like the API. */
function searchable(term: string): boolean {
  return /\d/.test(term) || Array.from(term).length >= 3;
}

export default function FrontDeskPage() {
  const t = useTranslations();
  const router = useRouter();
  const session = useCachedSession();
  const text = usePatientText();
  const [term, setTerm] = useState('');
  const [registering, setRegistering] = useState(false);
  const settled = useDebouncedValue(term.trim(), 250);
  const results = useQuery({
    queryKey: patientQueryKeys.search(settled),
    queryFn: () => patientsApi.search(settled),
    enabled: searchable(settled),
    retry: false,
  });
  const canRegister = session?.permissions.includes('patient.record.register') ?? false;

  return (
    <PageLayout
      title={t('patients.title')}
      description={t('patients.description')}
      actions={
        canRegister ? (
          <Button onClick={() => setRegistering(true)}>{t('patients.newRegistration')}</Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('patients.searchLabel')} hint={t('patients.searchHint')}>
          {({ id, ...aria }) => (
            <TextInput
              id={id}
              type="search"
              autoFocus
              autoComplete="off"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              {...aria}
            />
          )}
        </Field>
        <QueryView
          query={results}
          isEmpty={(data) => data.patients.length === 0}
          empty={{ title: t('patients.noResults'), hint: t('patients.noResultsHint') }}
          columns={5}
        >
          {(data) => (
            <>
              <p className="text-text-muted">{t(MATCHED_BY_KEYS[data.matchedBy])}</p>
              <div className={TABLE_FRAME}>
                <table className={TABLE}>
                  <thead>
                    <tr>
                      <th scope="col" className={`${HEAD_CELL} text-start`}>
                        {t('patients.columnPatient')}
                      </th>
                      <th scope="col" className={`${HEAD_CELL} text-start`}>
                        {t('patients.columnMrn')}
                      </th>
                      <th scope="col" className={`${HEAD_CELL} text-start`}>
                        {t('patients.columnSexAge')}
                      </th>
                      <th scope="col" className={`${HEAD_CELL} text-start`}>
                        {t('patients.columnPhone')}
                      </th>
                      <th scope="col" className={`${HEAD_CELL} text-end`}>
                        {t('patients.nidLabel')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.patients.map((patient) => (
                      <tr key={patient.patientId} className={ROW}>
                        <td className={CELL}>
                          <Link
                            className={`${ROW_TITLE} underline`}
                            href={`/patients/${patient.patientId}`}
                          >
                            {displayName(patient)}
                          </Link>
                          {patient.identityStatus === 'TEMPORARY' ? (
                            <span className="ms-2 text-status-attention-text">
                              {t('patients.temporaryId')}
                            </span>
                          ) : null}
                        </td>
                        <td className={CELL} data-label={t('patients.columnMrn')}>
                          {patient.mrn}
                        </td>
                        <td className={CELL} data-label={t('patients.columnSexAge')}>
                          {text.sex(patient.sex)},{' '}
                          {text.age(patient.ageYears, patient.ageEstimated)}
                        </td>
                        <td className={CELL} data-label={t('patients.columnPhone')}>
                          {patient.phone ? text.digits(patient.phone) : '-'}
                        </td>
                        <td className={`${CELL} text-end`} data-label={t('patients.nidLabel')}>
                          {text.nid(patient.nidLast4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </QueryView>
      </div>
      {registering ? (
        <RegistrationDialog
          onOpenChange={setRegistering}
          onRegistered={(patientId) => router.push(`/patients/${patientId}`)}
        />
      ) : null}
    </PageLayout>
  );
}
