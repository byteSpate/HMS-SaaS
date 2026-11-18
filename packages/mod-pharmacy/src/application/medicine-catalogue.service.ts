// Medicine catalogue (T-CLI-03; FR-CLI-004, FR-PHA-011 subset; FR-AUD-001; SP-03). The hospital
// administrator lists, adds and edits medicines; the doctor searches the active ones while
// writing a prescription. Each change is one transaction with its audit event and a
// MedicineChanged outbox event. Lists read the table directly, so a saved medicine is in the
// doctor's picker on the next request (FR-CFG-001).
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateMedicineRequest,
  MedicineChoiceList,
  MedicineList,
  MedicineRecord,
  UpdateMedicineRequest,
} from '@hms/contracts';
import { withTenant, type PrismaClient } from '@hms/database';
import { DomainError, fieldError, type Clock } from '@hms/domain-kernel';
import { PRISMA, recordChange, requestScope } from '@hms/platform';
import { changedFields, medicineValuesOf } from '../domain/catalogue.js';
import {
  findMedicine,
  identityTaken,
  insertMedicine,
  listMedicines,
  searchMedicineChoices,
  updateMedicine,
} from '../infrastructure/medicine.repository.js';
import { PHARMACY_CLOCK } from './context.js';

const notFound = () => new DomainError('NOT_FOUND', 'Medicine not found');
const stale = (currentVersion: number) =>
  new DomainError('STALE_RECORD', 'Someone else changed this medicine; reload it', {
    currentVersion,
  });
const duplicate = () =>
  fieldError('brandName', 'This hospital already has this brand with the same strength and form');

/** Two saves of the same new medicine at once: the unique index refuses the second. */
const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';

@Injectable()
export class MedicineCatalogueService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(PHARMACY_CLOCK) private readonly clock: Clock,
  ) {}

  async list(): Promise<MedicineList> {
    return { medicines: await withTenant(this.prisma, requestScope(), listMedicines) };
  }

  async detail(medicineId: string): Promise<MedicineRecord> {
    const found = await withTenant(this.prisma, requestScope(), (tx) =>
      findMedicine(tx, medicineId),
    );
    if (!found) throw notFound();
    return found;
  }

  async search(text: string): Promise<MedicineChoiceList> {
    const medicines = await withTenant(this.prisma, requestScope(), (tx) =>
      searchMedicineChoices(tx, text),
    );
    return { medicines };
  }

  async create(request: CreateMedicineRequest): Promise<MedicineRecord> {
    const scope = requestScope();
    const values = medicineValuesOf(request);
    try {
      return await withTenant(this.prisma, scope, async (tx) => {
        if (await identityTaken(tx, values)) throw duplicate();
        const created = await insertMedicine(tx, scope, values);
        await recordChange(tx, scope, {
          action: 'pharmacy.medicine.created',
          eventType: 'MedicineChanged',
          targetType: 'medicine',
          targetId: created.medicineId,
          details: { version: created.version },
        });
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate();
      throw error;
    }
  }

  async update(medicineId: string, request: UpdateMedicineRequest): Promise<MedicineRecord> {
    const scope = requestScope();
    const next = { ...medicineValuesOf(request), active: request.active };
    try {
      return await withTenant(this.prisma, scope, async (tx) => {
        const stored = await findMedicine(tx, medicineId);
        if (!stored) throw notFound();
        if (stored.version !== request.expectedVersion) throw stale(stored.version);
        const changed = changedFields(stored, next);
        if (changed.length === 0) {
          throw fieldError('brandName', 'Nothing differs from the current values');
        }
        if (await identityTaken(tx, next, medicineId)) throw duplicate();
        const target = {
          medicineId,
          expectedVersion: request.expectedVersion,
          userId: scope.userId,
          at: this.clock.now(),
        };
        // A concurrent edit may have won since the read; the version check decides.
        if ((await updateMedicine(tx, target, next)) === 0) {
          throw stale(request.expectedVersion + 1);
        }
        const version = request.expectedVersion + 1;
        await recordChange(tx, scope, {
          action: 'pharmacy.medicine.changed',
          eventType: 'MedicineChanged',
          targetType: 'medicine',
          targetId: medicineId,
          details: {
            changedFields: changed.join(','),
            fromVersion: version - 1,
            toVersion: version,
          },
        });
        return { medicineId, ...next, version };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate();
      throw error;
    }
  }
}
