/**
 * P33: the trader's own exchange rates, and the reads of stored rates. A typed rate is one number for one pair and one UTC day,
 * saved in one atomic write; typing it again replaces it. A bank rate (ecbRates.ts) and a typed rate never replace each other:
 * their ids differ (D114). Damaged rows are never read (D8).
 */

import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import { decimalNormalize } from '../../domain/calculations/decimalKernel';
import { exchangeRateId, isExchangeRateRecordShape, type ExchangeRateRecord } from '../../domain/calculations/currencyConversion';
import { parsePositiveDecimalString } from '../../domain/trades';
import { isPriceCurrencyInput } from '../trades/priceCurrencyInput';
import { isVisualPnlDayKey } from '../visual-pnl/dayKeyCalendar';

/** A typed rate has at most 12 digits before the point and 12 after it. */
const TYPED_RATE_PATTERN = /^\d{1,12}(\.\d{1,12})?$/;
export const EXCHANGE_RATE_CODE_MAX_LENGTH = 12;
export interface TypedExchangeRateInput { readonly from: string; readonly to: string; readonly day: string; readonly rate: string }
export type TypedExchangeRateInvalidReason = 'rate-invalid' | 'pair-invalid' | 'day-invalid';
export type SaveTypedExchangeRateResult =
  | { readonly ok: true; readonly record: ExchangeRateRecord }
  | { readonly ok: false; readonly type: 'validation-error'; readonly reason: TypedExchangeRateInvalidReason }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'exchange-rate-save-failed' };

const refuse = (reason: TypedExchangeRateInvalidReason) => Object.freeze({ ok: false as const, reason });
const isRateCode = (value: string) => value !== '' && value.length <= EXCHANGE_RATE_CODE_MAX_LENGTH && isPriceCurrencyInput(value);

/** The record a typed rate is saved as: codes in capitals, the rate in its shortest exact form, rateDay = day. */
export function parseTypedExchangeRate(input: TypedExchangeRateInput, savedAt: string): Readonly<{ ok: true; record: ExchangeRateRecord } | { ok: false; reason: TypedExchangeRateInvalidReason }> {
  const rate = parsePositiveDecimalString(input.rate.trim());
  if (!rate.ok || !TYPED_RATE_PATTERN.test(rate.value)) return refuse('rate-invalid');
  const shortest = decimalNormalize(rate.value);
  if (!shortest.ok) return refuse('rate-invalid');
  const from = input.from.trim().toUpperCase();
  const to = input.to.trim().toUpperCase();
  if (!isRateCode(from) || !isRateCode(to) || from === to) return refuse('pair-invalid');
  if (!isVisualPnlDayKey(input.day)) return refuse('day-invalid');
  const record: ExchangeRateRecord = Object.freeze({ id: exchangeRateId('typed', from, to, input.day), source: 'typed' as const, from, to, day: input.day, rateDay: input.day, rate: shortest.value, savedAt });
  return isExchangeRateRecordShape(record) ? Object.freeze({ ok: true as const, record }) : refuse('pair-invalid');
}

/** Validates first and writes nothing on a refusal; a valid rate is one atomic write that replaces the same typed pair and day. */
export async function saveTypedExchangeRate(db: KairosDatabase, input: TypedExchangeRateInput, dependencies: { readonly now?: () => string } = {}): Promise<SaveTypedExchangeRateResult> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const parsed = parseTypedExchangeRate(input, now());
  if (!parsed.ok) return { ok: false, type: 'validation-error', reason: parsed.reason };
  try {
    await runKairosAtomicWrite(db, ['exchangeRates'], ({ repositories }) => repositories.exchangeRates.put(parsed.record));
    return { ok: true, record: parsed.record };
  } catch {
    return { ok: false, type: 'storage-error', reason: 'exchange-rate-save-failed' };
  }
}

/** The valid stored rates for these UTC days; no valid day means no read. */
export async function listExchangeRatesForDays(db: KairosDatabase, days: readonly string[]): Promise<readonly ExchangeRateRecord[]> {
  const wanted = [...new Set(days)].filter(isVisualPnlDayKey);
  if (wanted.length === 0) return Object.freeze([]);
  const rows = await createKairosRepositories(db).exchangeRates.listByDays(wanted);
  return Object.freeze(rows.filter(isExchangeRateRecordShape));
}

const SOURCE_ORDER: Readonly<Record<ExchangeRateRecord['source'], number>> = { ecb: 0, typed: 1 };

/** Every valid stored rate: newest day first, then from, then to, then the bank's before the trader's. */
export async function listSavedExchangeRates(db: KairosDatabase): Promise<readonly ExchangeRateRecord[]> {
  const rows = (await createKairosRepositories(db).exchangeRates.listAll()).filter(isExchangeRateRecordShape);
  rows.sort((left, right) =>
    right.day.localeCompare(left.day) || left.from.localeCompare(right.from) || left.to.localeCompare(right.to) || SOURCE_ORDER[left.source] - SOURCE_ORDER[right.source]);
  return Object.freeze(rows);
}
