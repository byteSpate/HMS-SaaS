// Text as stored for names and master data (FR-PAT-009, FR-PRA-001, FR-CFG-001): Unicode NFC with
// spaces tidied, so the same Bangla or English text typed two ways compares equal, and a blank
// entry becomes null, so "not recorded" has one spelling.

export function tidyText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const tidy = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  return tidy.length > 0 ? tidy : null;
}
