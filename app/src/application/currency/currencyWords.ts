// P33: the currency engine's words. Every number and every rate comes from its owner; these functions only put them in plain words.
// Days read '18 September 2026', in English on every device, as ResultsCalendar's dayLabel does (ResultsCalendar.tsx:18-21).
import type { EcbReferenceCurrency, ExchangeRateRecord } from '../../domain/calculations/currencyConversion';

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
