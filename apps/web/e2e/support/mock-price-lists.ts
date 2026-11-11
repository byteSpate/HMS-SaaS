// In-memory stand-in for the price list endpoints (T-BIL-01), answering with payloads that satisfy
// the shared contracts. Used by the doctor-fee browser tests; the real behaviour (versions in
// force, the draft-only trigger, audit) is covered by apps/api/src/price-lists.api.spec.ts. Names
// are synthetic.
import {
  priceListChangesSchema,
  priceListListSchema,
  priceListSchema,
  publishPriceListRequestSchema,
  removeDoctorFeeRequestSchema,
  setDoctorFeeRequestSchema,
  type DoctorFee,
  type PractitionerChoice,
  type PriceListChange,
  type PriceList,
} from '@hms/contracts';

const ID = (n: number): string => `0199e0b0-0000-7000-8000-${String(n).padStart(12, '0')}`;

export interface PriceListAnswer {
  status: number;
  body?: unknown;
}

const problem = (status: number, code: string, fields?: { path: string; message: string }[]) => ({
  status,
  body: { type: `urn:hms:error:${code}`, title: code, status, code, ...(fields ? { fields } : {}) },
});

export const MOCK_DOCTORS: PractitionerChoice[] = [
  {
    practitionerId: ID(801),
    nameBn: null,
    nameEn: 'Karim Uddin',
    specialty: 'Medicine',
    department: null,
  },
  {
    practitionerId: ID(802),
    nameBn: null,
    nameEn: 'Rahima Akter',
    specialty: 'Gynaecology',
    department: null,
  },
];

export function createPriceListStore() {
  let next = 870;
  const versions: PriceList[] = [];

  const inForceId = () =>
    versions
      .filter((version) => version.status === 'PUBLISHED')
      .filter((version) => new Date(version.effectiveFrom ?? 0).getTime() <= Date.now())
      .sort((left, right) => (right.effectiveFrom ?? '').localeCompare(left.effectiveFrom ?? ''))[0]
      ?.priceListId;

  const view = (version: PriceList): PriceList =>
    priceListSchema.parse({
      ...version,
      inForce: version.priceListId === inForceId(),
      doctorFeeCount: version.doctorFees.length,
    });

  /** A test seeds the fees in force, as if published earlier. */
  function seedInForce(fees: DoctorFee[]) {
    versions.push({
      priceListId: ID(next++),
      versionNo: versions.length + 1,
      status: 'PUBLISHED',
      effectiveFrom: new Date(Date.now() - 86_400_000).toISOString(),
      publishedAt: new Date(Date.now() - 86_400_000).toISOString(),
      inForce: true,
      doctorFeeCount: fees.length,
      version: 2,
      doctorFees: fees,
    });
  }

  const findDraft = (priceListId: string) =>
    versions.find((version) => version.priceListId === priceListId && version.status === 'DRAFT');

  function createDraft(): PriceListAnswer {
    if (versions.some((version) => version.status === 'DRAFT')) {
      return problem(409, 'INVALID_TRANSITION');
    }
    const source = versions.find((version) => version.priceListId === inForceId());
    const draft: PriceList = {
      priceListId: ID(next++),
      versionNo: versions.length + 1,
      status: 'DRAFT',
      effectiveFrom: null,
      publishedAt: null,
      inForce: false,
      doctorFeeCount: 0,
      version: 1,
      doctorFees: source ? [...source.doctorFees] : [],
    };
    versions.push(draft);
    return { status: 201, body: view(draft) };
  }

  function setFee(priceListId: string, practitionerId: string, body: unknown): PriceListAnswer {
    const draft = findDraft(priceListId);
    if (!draft) return problem(409, 'INVALID_TRANSITION');
    const request = setDoctorFeeRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    if (request.data.expectedVersion !== draft.version) return problem(409, 'STALE_RECORD');
    const practitioner = MOCK_DOCTORS.find((doctor) => doctor.practitionerId === practitionerId);
    if (!practitioner) {
      return problem(422, 'VALIDATION_FAILED', [{ path: 'practitionerId', message: 'Unknown' }]);
    }
    const { expectedVersion, ...fee } = request.data;
    draft.doctorFees = [
      ...draft.doctorFees.filter((row) => row.practitioner.practitionerId !== practitionerId),
      { practitioner, ...fee },
    ].sort((left, right) =>
      (left.practitioner.nameEn ?? '').localeCompare(right.practitioner.nameEn ?? ''),
    );
    draft.version = expectedVersion + 1;
    return { status: 200, body: view(draft) };
  }

  function removeFee(priceListId: string, practitionerId: string, body: unknown): PriceListAnswer {
    const draft = findDraft(priceListId);
    const request = removeDoctorFeeRequestSchema.safeParse(body);
    if (!draft || !request.success) return problem(422, 'VALIDATION_FAILED');
    if (request.data.expectedVersion !== draft.version) return problem(409, 'STALE_RECORD');
    draft.doctorFees = draft.doctorFees.filter(
      (row) => row.practitioner.practitionerId !== practitionerId,
    );
    draft.version += 1;
    return { status: 200, body: view(draft) };
  }

  function changes(priceListId: string): PriceListAnswer {
    const version = versions.find((row) => row.priceListId === priceListId);
    if (!version) return problem(404, 'NOT_FOUND');
    const inForce = versions.find((row) => row.priceListId === inForceId());
    const before = new Map(
      inForce?.doctorFees.map((fee) => [fee.practitioner.practitionerId, fee]),
    );
    const values = (fee: DoctorFee) => ({
      newPatientFee: fee.newPatientFee,
      followUpFee: fee.followUpFee,
      followUpDays: fee.followUpDays,
    });
    const rows = version.doctorFees.flatMap((fee): PriceListChange[] => {
      const old = before.get(fee.practitioner.practitionerId);
      before.delete(fee.practitioner.practitionerId);
      if (!old)
        return [
          { practitioner: fee.practitioner, change: 'ADDED', before: null, after: values(fee) },
        ];
      const same = JSON.stringify(values(old)) === JSON.stringify(values(fee));
      return same
        ? []
        : [
            {
              practitioner: fee.practitioner,
              change: 'CHANGED',
              before: values(old),
              after: values(fee),
            },
          ];
    });
    for (const old of before.values()) {
      rows.push({
        practitioner: old.practitioner,
        change: 'REMOVED',
        before: values(old),
        after: null,
      });
    }
    return {
      status: 200,
      body: priceListChangesSchema.parse({
        comparedWithVersionNo: inForce?.versionNo ?? null,
        changes: rows,
      }),
    };
  }

  function publish(priceListId: string, body: unknown): PriceListAnswer {
    const draft = findDraft(priceListId);
    if (!draft) return problem(409, 'INVALID_TRANSITION');
    const request = publishPriceListRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    if (request.data.expectedVersion !== draft.version) return problem(409, 'STALE_RECORD');
    const now = new Date().toISOString();
    draft.status = 'PUBLISHED';
    draft.effectiveFrom = request.data.effectiveFrom
      ? new Date(request.data.effectiveFrom).toISOString()
      : now;
    draft.publishedAt = now;
    draft.version += 1;
    return { status: 200, body: view(draft) };
  }

  /** Newest first, as summaries: the list carries no fees. */
  function list(): PriceListAnswer {
    const priceLists = [...versions].reverse().map((version) => {
      const summary: Record<string, unknown> = { ...view(version) };
      delete summary.doctorFees;
      return summary;
    });
    return { status: 200, body: priceListListSchema.parse({ priceLists }) };
  }

  function read(priceListId: string): PriceListAnswer {
    const version = versions.find((row) => row.priceListId === priceListId);
    return version ? { status: 200, body: view(version) } : problem(404, 'NOT_FOUND');
  }

  function answer(method: string, path: string, body: unknown): PriceListAnswer | undefined {
    if (!path.startsWith('/billing/price-lists')) return undefined;
    const parts = path.split('/').slice(3);
    const [priceListId, section, practitionerId, action] = parts;
    if (!priceListId) return method === 'GET' ? list() : createDraft();
    if (priceListId === 'practitioner-choices') {
      return { status: 200, body: { practitioners: MOCK_DOCTORS } };
    }
    if (!section) return read(priceListId);
    if (section === 'changes') return changes(priceListId);
    if (section === 'publish') return publish(priceListId, body);
    if (section === 'doctor-fees' && practitionerId) {
      return action === 'remove'
        ? removeFee(priceListId, practitionerId, body)
        : setFee(priceListId, practitionerId, body);
    }
    return undefined;
  }

  return { answer, seedInForce, versions };
}
