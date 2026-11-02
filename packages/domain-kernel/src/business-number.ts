// Formats business numbers from a hospital's numbering pattern (T-PLT-04; FR-CFG-003; CP-09).
// MRN is {PREFIX}-{seq:6}, for example SMH-000123 (C-033). Patterns of other documents are still
// open (Q-034), so the pattern comes from the caller rather than being fixed here.
const PLACEHOLDER = /\{([^{}]*)\}/g;
const SEQUENCE = /^seq(?::(\d+))?$/;

function assertValidPattern(pattern: string): void {
  const tokens = [...pattern.matchAll(PLACEHOLDER)].map((match) => match[1] ?? '');
  const sequences = tokens.filter((token) => SEQUENCE.test(token));
  const known = tokens.every((token) => token === 'PREFIX' || SEQUENCE.test(token));
  if (sequences.length !== 1 || !known) throw new Error(`Invalid number pattern: ${pattern}`);
}

export function formatBusinessNumber(pattern: string, value: number, prefix?: string): string {
  assertValidPattern(pattern);
  return pattern.replace(PLACEHOLDER, (_match, token: string) => {
    if (token === 'PREFIX') {
      if (!prefix) throw new Error(`Number pattern ${pattern} needs a prefix`);
      return prefix;
    }
    const width = Number(SEQUENCE.exec(token)?.[1] ?? 0);
    // Padding only: a number that outgrows its width must stay complete and unique.
    return String(value).padStart(width, '0');
  });
}
