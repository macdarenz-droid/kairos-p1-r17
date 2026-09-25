// P33: the currency engine's words. Every number and every rate comes from its owner; these functions only put them in plain words.
// Days read '18 September 2026', in English on every device, as ResultsCalendar's dayLabel does (ResultsCalendar.tsx:18-21).
import type { EcbReferenceCurrency, ExchangeRateRecord } from '../../domain/calculations/currencyConversion';
import type { FetchEcbRatesResult } from './ecbRates';
import type { MissingExchangeRate } from './resultsInHomeCurrency';

export const CURRENCY_NAMES: Readonly<Record<EcbReferenceCurrency, string>> = Object.freeze({
  AUD: 'Australian dollar', BRL: 'Brazilian real', CAD: 'Canadian dollar', CHF: 'Swiss franc', CNY: 'Chinese yuan renminbi',
  CZK: 'Czech koruna', DKK: 'Danish krone', EUR: 'Euro', GBP: 'Pound sterling', HKD: 'Hong Kong dollar',
  HUF: 'Hungarian forint', IDR: 'Indonesian rupiah', ILS: 'Israeli shekel', INR: 'Indian rupee', ISK: 'Icelandic krona',
  JPY: 'Japanese yen', KRW: 'South Korean won', MXN: 'Mexican peso', MYR: 'Malaysian ringgit', NOK: 'Norwegian krone',
  NZD: 'New Zealand dollar', PHP: 'Philippine peso', PLN: 'Polish zloty', RON: 'Romanian leu', SEK: 'Swedish krona',
  SGD: 'Singapore dollar', THB: 'Thai baht', TRY: 'Turkish lira', USD: 'US dollar', ZAR: 'South African rand',
});

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

/** "18 September 2026" for a `YYYY-MM-DD` key. */
export function currencyDayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

/** "EUR · Euro". */
export function describeCurrencyOption(code: EcbReferenceCurrency): string {
  return `${code} · ${CURRENCY_NAMES[code]}`;
}

export function describeHomeCurrencySaved(currency: EcbReferenceCurrency | null): string {
  return currency === null ? 'Saved. Your totals keep each currency apart.' : `Saved. Your totals are shown in ${currency} (${CURRENCY_NAMES[currency]}).`;
}

/** One saved rate: its day, the rate, and where it came from (typed, the bank's own day, or the bank's earlier day). */
export function describeSavedRate(rate: ExchangeRateRecord): string {
  const head = `${currencyDayLabel(rate.day)}: 1 ${rate.from} = ${rate.rate} ${rate.to}`;
  if (rate.source === 'typed') return `${head}, typed by you.`;
  if (rate.rateDay === rate.day) return `${head}, from the European Central Bank.`;
  return `${head}, the European Central Bank's rate of ${currencyDayLabel(rate.rateDay)} (it sets none at weekends and on its holidays).`;
}

/** "GBP to EUR · 18 September 2026 · 1 trade". */
export function describeMissingRate(missing: MissingExchangeRate): string {
  return `${missing.from} to ${missing.to} · ${currencyDayLabel(missing.day)} · ${missing.trades} ${missing.trades === 1 ? 'trade' : 'trades'}`;
}

/** "1 GBP in EUR on 18 September 2026": the label of the field a missing rate is typed in. */
export function missingRateLabel(missing: MissingExchangeRate): string {
  return `1 ${missing.from} in ${missing.to} on ${currencyDayLabel(missing.day)}`;
}

/** The save button's name; it starts with its visible text "Save rate" (WCAG 2.5.3). */
export function missingRateSaveLabel(missing: MissingExchangeRate): string {
  return `Save rate for ${missing.from} to ${missing.to}, ${currencyDayLabel(missing.day)}`;
}

export function describeTypedRateSaved(record: ExchangeRateRecord): string {
  return `Saved your rate: 1 ${record.from} = ${record.rate} ${record.to} for ${currencyDayLabel(record.day)}.`;
}

const ECB_ERRORS: Readonly<Record<Extract<FetchEcbRatesResult, { ok: false }>['reason'], string>> = Object.freeze({
  unavailable: 'Exchange rates are unavailable right now. Check your connection, then try again.',
  'storage-error': 'Kairos could not save the rates. Nothing was changed.',
  'nothing-to-fetch': 'The European Central Bank publishes none of these rates. Type them below.',
});

/** What a tap on "Get rates from the European Central Bank" did, in plain lines. */
export function describeEcbFetchResult(result: FetchEcbRatesResult): Readonly<{ tone: 'success' | 'error'; lines: readonly string[] }> {
  if (!result.ok) return Object.freeze({ tone: 'error' as const, lines: Object.freeze([ECB_ERRORS[result.reason]]) });
  const lines: string[] = [];
  if (result.saved > 0) lines.push(`Saved ${result.saved} ${result.saved === 1 ? 'rate' : 'rates'} from the European Central Bank.`);
  for (const day of [...new Set(result.notPublishedYet.map((need) => need.day))]) {
    lines.push(`No European Central Bank rate for ${currencyDayLabel(day)} yet. The bank sets one rate each working day at 14:15 Frankfurt time, and none at weekends or on its holidays: try again after its next working day.`);
  }
  return Object.freeze({ tone: 'success' as const, lines: Object.freeze(lines) });
}
