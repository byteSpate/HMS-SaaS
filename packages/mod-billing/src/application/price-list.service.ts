// Price lists with doctor fees (T-BIL-01; FR-CFG-001, FR-CFG-002, FR-BIL-007; C-041; FR-AUD-001;
// SP-03). An administrator with admin.price.publish opens a draft (a copy of the newest published
// version), sets or removes doctors' fees in it, previews the changes against the version in
// force, and publishes it now or from a later time. Each command is one transaction with its
// audit event and outbox event. Published versions never change (trigger in the migration).
import { Inject, Injectable } from '@nestjs/common';
import type {
  DoctorFee,
  PractitionerChoiceList,
  PriceList,
  PriceListChanges,
  PriceListList,
  PriceListSummary,
  PublishPriceListRequest,
  SetDoctorFeeRequest,
} from '@hms/contracts';
import { withTenant, type PrismaClient, type TenantTx } from '@hms/database';
import { DomainError, fieldError, Money, type Clock } from '@hms/domain-kernel';
import {
  findPractitionerChoices,
  isSchedulablePractitioner,
  listPractitionerChoices,
} from '@hms/mod-patients';
import { PRISMA, recordChange, requestScope, type Scope } from '@hms/platform';
import {
  assertDraft,
  diffDoctorFees,
  effectiveTimeFor,
  type FeeValues,
} from '../domain/price-list.js';
import {
  createDraft,
  doctorFeesOf,
  ensureDoctorFeeItems,
  findVersion,
  findVersionInForce,
  hasVersionEffectiveAt,
  listVersions,
  publishDraft,
  removeDoctorFee,
  touchDraft,
  writeDoctorFee,
  type StoredVersion,
} from '../infrastructure/price-list.repository.js';
import { BILLING_CLOCK } from './context.js';

const notFound = () => new DomainError('NOT_FOUND', 'Price list not found');
const stale = (currentVersion: number) =>
  new DomainError('STALE_RECORD', 'Someone else changed this price list; reload it', {
    currentVersion,
  });

const toValues = (fee: FeeValues) => ({
  newPatientFee: fee.newPatientFee.toDecimalString(),
  followUpFee: fee.followUpFee.toDecimalString(),
  followUpDays: fee.followUpDays,
});

function toSummary(version: StoredVersion, inForceId: string | null): PriceListSummary {
  return {
    priceListId: version.id,
    versionNo: version.versionNo,
    status: version.status as PriceListSummary['status'],
    effectiveFrom: version.effectiveFrom?.toISOString() ?? null,
    publishedAt: version.publishedAt?.toISOString() ?? null,
    inForce: version.id === inForceId,
    doctorFeeCount: version.doctorFeeCount,
    version: version.version,
  };
}

const nameOf = (fee: DoctorFee) => fee.practitioner.nameEn ?? fee.practitioner.nameBn ?? '';

const changeOf = (
  priceListId: string,
  action: string,
  details: Record<string, string | number | null>,
) => ({
  action,
  eventType: action === 'billing.price_list.published' ? 'PriceListPublished' : 'PriceListChanged',
  targetType: 'price_list_version',
  targetId: priceListId,
  details,
});

@Injectable()
export class PriceListService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(BILLING_CLOCK) private readonly clock: Clock,
  ) {}

  list(): Promise<PriceListList> {
    const scope = requestScope();
    const now = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      const inForce = await findVersionInForce(tx, now);
      const versions = await listVersions(tx);
      return { priceLists: versions.map((version) => toSummary(version, inForce?.id ?? null)) };
    });
  }

  practitionerChoices(): Promise<PractitionerChoiceList> {
    const scope = requestScope();
    return withTenant(this.prisma, scope, async (tx) => ({
      practitioners: await listPractitionerChoices(tx),
    }));
  }

  get(priceListId: string): Promise<PriceList> {
    const scope = requestScope();
    return withTenant(this.prisma, scope, (tx) => this.read(tx, priceListId));
  }

  /** One draft at a time; it starts as a copy of the newest published version. */
  createDraft(): Promise<PriceList> {
    const scope = requestScope();
    const now = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      await ensureDoctorFeeItems(tx, scope.tenantId);
      const draftId = await createDraft(tx, {
        tenantId: scope.tenantId,
        userId: scope.userId,
        at: now,
      });
      if (!draftId) {
        throw new DomainError('INVALID_TRANSITION', 'A draft price list already exists');
      }
      const draft = await this.read(tx, draftId);
      await recordChange(
        tx,
        scope,
        changeOf(draftId, 'billing.price_list.draft_created', {
          versionNo: draft.versionNo,
          doctorFeeCount: draft.doctorFeeCount,
        }),
      );
      return draft;
    });
  }

  setDoctorFee(
    priceListId: string,
    practitionerId: string,
    request: SetDoctorFeeRequest,
  ): Promise<PriceList> {
    const scope = requestScope();
    const now = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      await this.draftFor(tx, priceListId, request.expectedVersion);
      // RLS hides another hospital's practitioner, so it reads as not schedulable.
      if (!(await isSchedulablePractitioner(tx, practitionerId))) {
        throw fieldError('practitionerId', 'Choose an active practitioner of this hospital');
      }
      const items = await ensureDoctorFeeItems(tx, scope.tenantId);
      const fee: FeeValues = {
        newPatientFee: Money.parse(request.newPatientFee),
        followUpFee: Money.parse(request.followUpFee),
        followUpDays: request.followUpDays,
      };
      const target = { tenantId: scope.tenantId, versionId: priceListId, practitionerId, items };
      await writeDoctorFee(tx, target, fee);
      await this.touch(tx, scope, priceListId, request.expectedVersion, now);
      await recordChange(
        tx,
        scope,
        changeOf(priceListId, 'billing.doctor_fee.set', {
          practitionerId,
          ...toValues(fee),
          toVersion: request.expectedVersion + 1,
        }),
      );
      return this.read(tx, priceListId);
    });
  }

  removeDoctorFee(
    priceListId: string,
    practitionerId: string,
    expectedVersion: number,
  ): Promise<PriceList> {
    const scope = requestScope();
    const now = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      await this.draftFor(tx, priceListId, expectedVersion);
      if ((await removeDoctorFee(tx, priceListId, practitionerId)) === 0) {
        throw new DomainError('NOT_FOUND', 'This doctor has no fee in the draft');
      }
      await this.touch(tx, scope, priceListId, expectedVersion, now);
      await recordChange(
        tx,
        scope,
        changeOf(priceListId, 'billing.doctor_fee.removed', {
          practitionerId,
          toVersion: expectedVersion + 1,
        }),
      );
      return this.read(tx, priceListId);
    });
  }

  /** FR-CFG-002: the preview, doctor by doctor, against the version in force now. */
  changes(priceListId: string): Promise<PriceListChanges> {
    const scope = requestScope();
    const now = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      const version = await findVersion(tx, priceListId);
      if (!version) throw notFound();
      return this.changesAgainstInForce(tx, version, now);
    });
  }

  publish(priceListId: string, request: PublishPriceListRequest): Promise<PriceList> {
    const scope = requestScope();
    const now = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      const version = await this.draftFor(tx, priceListId, request.expectedVersion);
      const requested = request.effectiveFrom ? new Date(request.effectiveFrom) : undefined;
      const effectiveFrom = effectiveTimeFor(requested, now);
      if (await hasVersionEffectiveAt(tx, effectiveFrom)) {
        throw fieldError('effectiveFrom', 'Another version takes effect at this time');
      }
      const summary = await this.changesAgainstInForce(tx, version, now);
      const published = await publishDraft(tx, {
        versionId: priceListId,
        expectedVersion: request.expectedVersion,
        effectiveFrom,
        userId: scope.userId,
        at: now,
      });
      if (published === 0) throw stale(request.expectedVersion + 1);
      const count = (kind: string) =>
        summary.changes.filter((change) => change.change === kind).length;
      await recordChange(
        tx,
        scope,
        changeOf(priceListId, 'billing.price_list.published', {
          versionNo: version.versionNo,
          effectiveFrom: effectiveFrom.toISOString(),
          comparedWithVersionNo: summary.comparedWithVersionNo,
          added: count('ADDED'),
          changed: count('CHANGED'),
          removed: count('REMOVED'),
        }),
      );
      return this.read(tx, priceListId);
    });
  }

  private async read(tx: TenantTx, priceListId: string): Promise<PriceList> {
    const version = await findVersion(tx, priceListId);
    if (!version) throw notFound();
    const inForce = await findVersionInForce(tx, this.clock.now());
    const fees = await doctorFeesOf(tx, priceListId);
    const choices = await findPractitionerChoices(tx, [...fees.keys()]);
    const doctorFees = [...fees].flatMap(([practitionerId, fee]): DoctorFee[] => {
      const practitioner = choices.get(practitionerId);
      return practitioner ? [{ practitioner, ...toValues(fee) }] : [];
    });
    doctorFees.sort((left, right) => nameOf(left).localeCompare(nameOf(right)));
    return { ...toSummary(version, inForce?.id ?? null), doctorFees };
  }

  private async changesAgainstInForce(
    tx: TenantTx,
    version: StoredVersion,
    now: Date,
  ): Promise<PriceListChanges> {
    const inForce = await findVersionInForce(tx, now);
    const before = inForce ? await doctorFeesOf(tx, inForce.id) : new Map<string, FeeValues>();
    const after = await doctorFeesOf(tx, version.id);
    const changes = diffDoctorFees(before, after);
    const choices = await findPractitionerChoices(
      tx,
      changes.map((change) => change.practitionerId),
    );
    return {
      comparedWithVersionNo: inForce?.versionNo ?? null,
      changes: changes.flatMap((change) => {
        const practitioner = choices.get(change.practitionerId);
        if (!practitioner) return [];
        return [
          {
            practitioner,
            change: change.change,
            before: change.before ? toValues(change.before) : null,
            after: change.after ? toValues(change.after) : null,
          },
        ];
      }),
    };
  }

  /** The draft the screen showed, or why not: missing, published, or changed meanwhile. */
  private async draftFor(
    tx: TenantTx,
    priceListId: string,
    expectedVersion: number,
  ): Promise<StoredVersion> {
    const version = await findVersion(tx, priceListId);
    if (!version) throw notFound();
    assertDraft(version.status);
    if (version.version !== expectedVersion) throw stale(version.version);
    return version;
  }

  private async touch(
    tx: TenantTx,
    scope: Scope,
    priceListId: string,
    expectedVersion: number,
    at: Date,
  ): Promise<void> {
    const touched = await touchDraft(tx, {
      versionId: priceListId,
      expectedVersion,
      userId: scope.userId,
      at,
    });
    if (touched === 0) throw stale(expectedVersion + 1);
  }
}
