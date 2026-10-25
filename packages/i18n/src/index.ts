// Message catalogs (bn-BD, en) and formatters for digits, dates and money (ADR-017, C-025).
// Bangla strings are proposals until a native speaker reviews them (A1, Q-050).
import { bnBD } from './messages/bn-BD.js';
import { en, type Messages } from './messages/en.js';
import { siteBnBD } from './messages/site/bn-BD.js';
import { siteEn, type SiteMessages } from './messages/site/en.js';
import type { Locale } from './locale.js';

export { defaultLocale, htmlLang, isLocale, locales, type Locale } from './locale.js';
export { toLocaleDigits } from './digits.js';
export {
  formatMoney,
  formatNumber,
  groupLakhCrore,
  type CurrencySymbol,
  type MoneyFormatOptions,
} from './numbers.js';
export { formatDate, formatDateTime, type DateFormatOptions } from './dates.js';
export type { Messages } from './messages/en.js';
export type { SiteMessages } from './messages/site/en.js';

export const messages: Record<Locale, Messages> = { en, 'bn-BD': bnBD };

/** Public website catalog (apps/site), kept apart from the staff catalog (P-024). */
export const siteMessages: Record<Locale, SiteMessages> = { en: siteEn, 'bn-BD': siteBnBD };

export { cmsEn } from './messages/cms/en.js';
export { cmsBnBD } from './messages/cms/bn-BD.js';
