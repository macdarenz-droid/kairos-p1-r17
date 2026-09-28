/**
 * P33: the one owner of converting a result into another currency, and of what a stored exchange rate is. It never guesses:
 * pence become pounds by definition, a stablecoin counts as US dollars only by the trader's choice, and anything else needs a
 * rate for the day the trade closed: the trader's own, or the European Central Bank's through the euro. A missing rate is
 * missing, never 1 and never another day's rate beyond ECB_RATE_MAX_AGE_DAYS. Every number goes through the decimal kernel.
 */
import { parsePositiveDecimalString, type DecimalString } from '../trades';
import { decimalDivide, decimalMultiply, decimalNormalize, decimalRound, type DecimalKernelResult } from './decimalKernel';

/** The currencies the European Central Bank publishes a daily euro reference rate for (checked 2026-09-25), plus EUR. A home currency is one of these. */
export const ECB_REFERENCE_CURRENCIES = Object.freeze(['AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR'] as const);
export type EcbReferenceCurrency = (typeof ECB_REFERENCE_CURRENCIES)[number];
export function isEcbReferenceCurrency(code: string): code is EcbReferenceCurrency {
  return (ECB_REFERENCE_CURRENCIES as readonly string[]).includes(code);
}

/** Coins a trader may count as US dollars, 1 to 1, only when they choose to. */
export const USD_STABLECOINS = Object.freeze(['USDT', 'USDC'] as const);
export type UsdStablecoin = (typeof USD_STABLECOINS)[number];

/** Pence and pounds: 100 GBX = 1 GBP, by definition. Never an exchange rate. */
export const PENCE_CURRENCY = 'GBX';
export const POUND_CURRENCY = 'GBP';
export const PENCE_PER_POUND = '100';

/** A result converted with an exchange rate is rounded to this many places, half up. Pence and the stablecoin rule stay exact. */
export const CONVERTED_RESULT_PLACES = 2;
/** The bank's last rate before a day is used for at most this many days after it (Easter: Thursday's rate for Friday to Monday). */
export const ECB_RATE_MAX_AGE_DAYS = 4;

export type ExchangeRateSource = 'ecb' | 'typed';
/**
 * One stored exchange rate: 1 `from` = `rate` `to`, for the results of trades closed on `day` (a UTC calendar day).
 * 'ecb': from is EUR, and rateDay is the day the bank set it (day, or its last working day before it).
 * 'typed': the trader's own rate for that day; rateDay = day.
 */
export interface ExchangeRateRecord {
  readonly id: string;
  readonly source: ExchangeRateSource;
  readonly from: string;
  readonly to: string;
  readonly day: string;
  readonly rateDay: string;
  readonly rate: DecimalString;
  readonly savedAt: string;
}

/** 'ecb:EUR:USD:2026-09-18': one rate per source, pair and day, so a typed rate and a bank rate never replace each other. */
export function exchangeRateId(source: ExchangeRateSource, from: string, to: string, day: string): string {
  return `${source}:${from}:${to}:${day}`;
}

const CODE_PATTERN = /^[A-Z0-9]{1,12}$/;
const ECB_CODE_PATTERN = /^[A-Z]{3}$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RECORD_KEYS = 'day,from,id,rate,rateDay,savedAt,source,to';
const DAY_MS = 86_400_000;

const isCode = (value: unknown): value is string => typeof value === 'string' && CODE_PATTERN.test(value) && /[A-Z]/.test(value);
/** Days since 1970-01-01 for a real YYYY-MM-DD date, else null. */
function dayIndex(value: unknown): number | null {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time / DAY_MS : null;
}
const isInstant = (value: unknown): boolean => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;

/** The stored shape of one rate: checked by integrity, backups and every reader. */
export function isExchangeRateRecordShape(value: unknown): value is ExchangeRateRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== RECORD_KEYS) return false;
  const day = dayIndex(record.day);
  const rateDay = dayIndex(record.rateDay);
  if (day === null || rateDay === null || !isCode(record.from) || !isCode(record.to) || record.from === record.to || !isInstant(record.savedAt)) return false;
  if (typeof record.rate !== 'string' || !parsePositiveDecimalString(record.rate).ok) return false;
  const shortest = decimalNormalize(record.rate);
  if (!shortest.ok || shortest.value !== record.rate) return false;
  if (record.source === 'typed') {
    if (rateDay !== day) return false;
  } else if (record.source === 'ecb') {
    if (record.from !== 'EUR' || !ECB_CODE_PATTERN.test(record.to) || rateDay > day || day - rateDay > ECB_RATE_MAX_AGE_DAYS) return false;
  } else return false;
  return record.id === exchangeRateId(record.source, record.from, record.to, record.day as string);
}

/** True when one side is in pence (GBX) and the other in pounds (GBP). */
export function isPenceAndPounds(left: string | null, right: string | null): boolean {
  return (left === PENCE_CURRENCY && right === POUND_CURRENCY) || (left === POUND_CURRENCY && right === PENCE_CURRENCY);
}

/** Pence as pounds (÷ 100) or pounds as pence (× 100), exactly; null when the two are not pence and pounds. */
export function convertPenceAndPounds(amount: DecimalString, from: string, to: string): DecimalKernelResult | null {
  if (from === PENCE_CURRENCY && to === POUND_CURRENCY) return decimalDivide(amount, PENCE_PER_POUND);
  if (from === POUND_CURRENCY && to === PENCE_CURRENCY) return decimalMultiply(amount, PENCE_PER_POUND);
  return null;
}

export type CurrencyConversionStep =
  | Readonly<{ kind: 'pence'; from: 'GBX'; to: 'GBP' }>
  | Readonly<{ kind: 'stablecoin'; from: UsdStablecoin; to: 'USD' }>
  | Readonly<{ kind: 'typed-rate'; from: string; to: string; day: string; rate: DecimalString }>
  | Readonly<{ kind: 'ecb-rate'; from: string; to: string; day: string; rateDay: string; eurFrom: DecimalString | null; eurTo: DecimalString | null }>;

export interface CurrencyConversionInput {
  readonly amount: DecimalString;
  /** The recorded currency of the amount. */
  readonly currency: string;
  /** The UTC calendar day the trade closed (YYYY-MM-DD); only rates for this day are used. */
  readonly day: string;
  /** The home currency. */
  readonly target: string;
  /** The coins the trader counts as US dollars. */
  readonly usdStablecoins: readonly UsdStablecoin[];
  readonly rates: readonly ExchangeRateRecord[];
}

export type CurrencyConversionResult =
  | Readonly<{ ok: true; amount: DecimalString; currency: string; steps: readonly CurrencyConversionStep[] }>
  | Readonly<{ ok: false; reason: 'missing-rate'; from: string; to: string; day: string }>
  | Readonly<{ ok: false; reason: 'invalid-currency' | 'invalid-decimal' }>;

const failure = (reason: 'invalid-currency' | 'invalid-decimal'): CurrencyConversionResult => Object.freeze({ ok: false as const, reason });

/**
 * One result in the target currency. In order: pence become pounds; a coin the trader counts as US dollars becomes USD;
 * then the trader's typed rate for that day, else the bank's rates for that day through the euro. With no rate it says
 * which pair is missing. A result converted with a rate is rounded to CONVERTED_RESULT_PLACES, half up.
 */
export function convertCurrencyAmount(input: CurrencyConversionInput): CurrencyConversionResult {
  if (!isCode(input.currency)) return failure('invalid-currency');
  const steps: CurrencyConversionStep[] = [];
  const done = (amount: DecimalString): CurrencyConversionResult => Object.freeze({ ok: true as const, amount, currency: input.target, steps: Object.freeze([...steps]) });
  let amount = input.amount;
  let currency = input.currency;
  if (currency === input.target) return done(amount);
  if (currency === PENCE_CURRENCY) {
    const pounds = convertPenceAndPounds(amount, PENCE_CURRENCY, POUND_CURRENCY);
    if (pounds === null || !pounds.ok) return failure('invalid-decimal');
    amount = pounds.value;
    currency = POUND_CURRENCY;
    steps.push(Object.freeze({ kind: 'pence' as const, from: PENCE_CURRENCY, to: POUND_CURRENCY }));
  }
  const coin = input.usdStablecoins.find((code) => code === currency);
  if (coin !== undefined) {
    currency = 'USD';
    steps.push(Object.freeze({ kind: 'stablecoin' as const, from: coin, to: 'USD' as const }));
  }
  if (currency === input.target) return done(amount);
  const ofDay = input.rates.filter((rate) => rate.day === input.day);
  const typed = ofDay.find((rate) => rate.source === 'typed' && rate.from === currency && rate.to === input.target);
  if (typed !== undefined) {
    const product = decimalMultiply(amount, typed.rate);
    const rounded = product.ok ? decimalRound(product.value, CONVERTED_RESULT_PLACES, 'half-up') : product;
    if (!rounded.ok) return failure('invalid-decimal');
    steps.push(Object.freeze({ kind: 'typed-rate' as const, from: currency, to: input.target, day: input.day, rate: typed.rate }));
    return done(rounded.value);
  }
  // 1 EUR = rate `code`: null for the euro itself, undefined when the bank's rate for that day is not stored.
  const leg = (code: string): ExchangeRateRecord | null | undefined =>
    code === 'EUR' ? null : ofDay.find((rate) => rate.source === 'ecb' && rate.from === 'EUR' && rate.to === code);
  const fromLeg = leg(currency);
  const toLeg = leg(input.target);
  const rateDay = fromLeg?.rateDay ?? toLeg?.rateDay;
  if (fromLeg === undefined || toLeg === undefined || rateDay === undefined || (fromLeg !== null && toLeg !== null && fromLeg.rateDay !== toLeg.rateDay)) {
    return Object.freeze({ ok: false as const, reason: 'missing-rate' as const, from: currency, to: input.target, day: input.day });
  }
  const inTarget: DecimalKernelResult = toLeg === null ? { ok: true, value: amount } : decimalMultiply(amount, toLeg.rate);
  const converted = !inTarget.ok || fromLeg === null ? inTarget : decimalDivide(inTarget.value, fromLeg.rate);
  const rounded = converted.ok ? decimalRound(converted.value, CONVERTED_RESULT_PLACES, 'half-up') : converted;
  if (!rounded.ok) return failure('invalid-decimal');
  steps.push(Object.freeze({ kind: 'ecb-rate' as const, from: currency, to: input.target, day: input.day, rateDay, eurFrom: fromLeg?.rate ?? null, eurTo: toLeg?.rate ?? null }));
  return done(rounded.value);
}
