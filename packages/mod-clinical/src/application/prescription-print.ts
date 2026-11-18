// What a printed prescription shows (T-CLI-03; FR-CLI-005..007; UC-CLI-02). Pure: the signed
// version, the consultation's signed note (allergies and advice), the doctor, the patient, the
// hospital and the next booked visit become the template's data. Without a signed note the
// allergies print as "Not recorded" (FR-CLI-007: absence is never "no allergies").
import type { NoteContent, PrescriptionContent, PrescriptionLine } from '@hms/contracts';
import type { PractitionerPrintDetails } from '@hms/mod-patients';
import type { PrescriptionPrintData, PrescriptionPrintLine } from '@hms/print-templates';

export interface PrintSources {
  hospital: { nameEn: string; nameBn?: string };
  doctor: PractitionerPrintDetails;
  patient: { nameEn: string | null; nameBn: string | null; mrn: string };
  version: { versionNo: number; content: PrescriptionContent; signedAt: Date; signedBy: string };
  /** The latest signed version of the consultation note, if any. */
  note: NoteContent | null;
  nextVisit: string | null;
}

const optional = <K extends string>(key: K, value: string | null | undefined) =>
  (value ? { [key]: value } : {}) as Partial<Record<K, string>>;

function medicineName(line: PrescriptionLine): string {
  const { brandName, strength, form } = line.medicine;
  return [brandName, strength, form].filter((part) => part !== null && part !== '').join(' ');
}

function printLine(line: PrescriptionLine): PrescriptionPrintLine {
  return {
    medicine: medicineName(line),
    genericName: line.medicine.genericName,
    dose: line.dose,
    route: line.route,
    frequency: line.frequency,
    duration: line.duration,
    instructionsEn: line.instructionsEn,
    instructionsBn: line.instructionsBn,
    quantity: line.quantity,
    fulfilment: line.fulfilment,
  };
}

export function prescriptionPrintDataOf(sources: PrintSources): PrescriptionPrintData {
  const { doctor, patient, version, note } = sources;
  return {
    hospital: sources.hospital,
    doctor: {
      nameEn: doctor.nameEn ?? doctor.nameBn ?? '',
      ...optional('nameBn', doctor.nameBn),
      ...optional('degrees', doctor.degrees),
      ...optional('specialty', doctor.specialty),
      ...optional('registrationNo', doctor.registrationNo),
    },
    patient: {
      nameEn: patient.nameEn ?? patient.nameBn ?? '',
      ...optional('nameBn', patient.nameBn),
      mrn: patient.mrn,
    },
    allergies: note ? note.allergies : { status: 'NOT_RECORDED' },
    lines: version.content.lines.map(printLine),
    ...optional('advice', note?.advice),
    ...optional('nextVisit', sources.nextVisit),
    signedBy: version.signedBy,
    signedAt: version.signedAt.toISOString(),
    amended: version.versionNo > 1,
  };
}
