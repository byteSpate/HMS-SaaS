// Money value object (ADR-007; T-BIL-01). Amounts are a bigint of minor units with a currency, so
// totals are exact and a float can never slip into arithmetic. Conversion from and to the
// database's numeric(18,2) happens only in repositories; the API carries decimal strings
// ("500.00"). No rounding happens here: a rounding policy, when one exists, adds its own line.
export type CurrencyCode = 'BDT' | (string & {});

const MINOR_DIGITS = 2;
const MINOR_PER_MAJOR = 10n ** BigInt(MINOR_DIGITS);
const DECIMAL = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

export class Money {
  private constructor(
    readonly minorUnits: bigint,
    readonly currency: CurrencyCode,
  ) {}

  static zero(currency: CurrencyCode = 'BDT'): Money {
    return new Money(0n, currency);
  }

  static fromMinorUnits(minorUnits: bigint, currency: CurrencyCode = 'BDT'): Money {
    return new Money(minorUnits, currency);
  }

  /** A decimal string with at most two decimals, as the API and the database carry it. */
  static parse(amount: string, currency: CurrencyCode = 'BDT'): Money {
    const match = DECIMAL.exec(amount);
    if (!match) throw new Error(`Not an amount: "${amount}"`);
    const [, sign, major = '0', minor = ''] = match;
    const units = BigInt(major) * MINOR_PER_MAJOR + BigInt(minor.padEnd(MINOR_DIGITS, '0'));
    return new Money(sign ? -units : units, currency);
  }

  plus(other: Money): Money {
    return new Money(this.minorUnits + this.sameCurrency(other).minorUnits, this.currency);
  }

  minus(other: Money): Money {
    return new Money(this.minorUnits - this.sameCurrency(other).minorUnits, this.currency);
  }

  /** Whole quantities only: a fractional quantity would need a rounding policy (Q-020). */
  times(quantity: number): Money {
    if (!Number.isInteger(quantity)) throw new Error(`Not a whole quantity: ${quantity}`);
    return new Money(this.minorUnits * BigInt(quantity), this.currency);
  }

  compare(other: Money): -1 | 0 | 1 {
    const difference = this.minorUnits - this.sameCurrency(other).minorUnits;
    if (difference === 0n) return 0;
    return difference < 0n ? -1 : 1;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.minorUnits === other.minorUnits;
  }

  isZero(): boolean {
    return this.minorUnits === 0n;
  }

  isPositive(): boolean {
    return this.minorUnits > 0n;
  }

  toDecimalString(): string {
    const negative = this.minorUnits < 0n;
    const units = negative ? -this.minorUnits : this.minorUnits;
    const major = units / MINOR_PER_MAJOR;
    const minor = String(units % MINOR_PER_MAJOR).padStart(MINOR_DIGITS, '0');
    return `${negative ? '-' : ''}${major}.${minor}`;
  }

  private sameCurrency(other: Money): Money {
    if (other.currency !== this.currency) {
      throw new Error(`Cannot mix currencies ${this.currency} and ${other.currency}`);
    }
    return other;
  }
}
