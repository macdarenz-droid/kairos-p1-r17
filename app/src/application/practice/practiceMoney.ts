/**
 * P26 practice money: a pretend amount the trader chooses, stored as one metadata preference (no schema change; it travels in every full backup like the goals). What it is now = the start + the result after fees of every closed practice trade, added up by the P13 aggregation owner.
 * Shown only when every closed practice trade has a result in the money's own currency. Kairos never converts currencies and never counts a missing result as zero. Real trades, goals, Home and the discipline score never use it.
 */

import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories, type MetadataRepository } from '../../data/repositories';
import { decimalAdd, decimalCompare, decimalScaleToSteps } from '../../domain/calculations/decimalKernel';
import { parsePositiveDecimalString, type DecimalString } from '../../domain/trades';
import { listJournalClosedTradesInPeriod } from '../journal/closedTradePeriodQuery';
import { isPriceCurrencyInput } from '../trades/priceCurrencyInput';
import { summarizeVisualPnlAggregation, type VisualPnlAggregationSummary } from '../visual-pnl';

export const practiceMoneyMetadataKey = 'preferences.practice-money.v1';
/** The longer bar of the practice money picture is always this many steps. */
export const PRACTICE_MONEY_PICTURE_STEPS = 20;
export const PRACTICE_MONEY_CURRENCY_MAX_LENGTH = 12;
export interface PracticeMoney { readonly startAmount: DecimalString; readonly currency: string }
export interface PracticeMoneyInput { readonly startAmount: string; readonly currency: string }
export type PracticeMoneyInvalidReason = 'start-amount-invalid' | 'currency-invalid';
export type PracticeMoneyUnavailableReason = 'other-currency' | 'missing-currency' | 'trade-without-result' | 'mixed-currencies' | 'calculation-failed';
export type PracticeMoneyView =
  | Readonly<{ kind: 'not-set' }>
  | Readonly<{ kind: 'ready'; money: PracticeMoney; closedTrades: number; resultSoFar: DecimalString; currentAmount: DecimalString; outcome: 'profit' | 'loss' | 'breakeven'; startSteps: number; currentSteps: number }>
  | Readonly<{ kind: 'unavailable'; money: PracticeMoney; closedTrades: number; reason: PracticeMoneyUnavailableReason; resultCurrency: string | null }>;
export type SavePracticeMoneyResult =
  | { readonly ok: true; readonly money: PracticeMoney }
  | { readonly ok: false; readonly type: 'validation-error'; readonly reason: PracticeMoneyInvalidReason }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'practice-money-save-failed' };

const START_AMOUNT_PATTERN = /^\d{1,12}(\.\d{1,8})?$/;
const STORED_KEYS = ['currency', 'startAmount', 'version'];

/** The amount first, then the currency; trimmed, and the currency in capitals like a trade's price currency. */
export function parsePracticeMoneyInput(input: PracticeMoneyInput): Readonly<{ ok: true; money: PracticeMoney } | { ok: false; reason: PracticeMoneyInvalidReason }> {
  const amount = parsePositiveDecimalString(input.startAmount);
  if (!amount.ok || !START_AMOUNT_PATTERN.test(amount.value)) return Object.freeze({ ok: false as const, reason: 'start-amount-invalid' as const });
  const currency = input.currency.trim().toUpperCase();
  if (currency === '' || currency.length > PRACTICE_MONEY_CURRENCY_MAX_LENGTH || !isPriceCurrencyInput(currency)) return Object.freeze({ ok: false as const, reason: 'currency-invalid' as const });
  return Object.freeze({ ok: true as const, money: Object.freeze({ startAmount: amount.value, currency }) });
}

/** The stored money; a missing or damaged record reads as null. Never writes. */
export async function readPracticeMoney(metadata: MetadataRepository): Promise<PracticeMoney | null> {
  const stored = await metadata.get(practiceMoneyMetadataKey);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored.value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 || Object.keys(record).sort().join(',') !== STORED_KEYS.join(',')) return null;
    if (typeof record.startAmount !== 'string' || typeof record.currency !== 'string') return null;
    const result = parsePracticeMoneyInput({ startAmount: record.startAmount, currency: record.currency });
    if (!result.ok || result.money.startAmount !== record.startAmount || result.money.currency !== record.currency) return null;
    return result.money;
  } catch {
    return null;
  }
}

/** Validates first and writes nothing on a refusal; a valid save is one atomic metadata write. */
export async function savePracticeMoney(db: KairosDatabase, input: PracticeMoneyInput, dependencies: { readonly now?: () => string } = {}): Promise<SavePracticeMoneyResult> {
  const parsed = parsePracticeMoneyInput(input);
  if (!parsed.ok) return { ok: false, type: 'validation-error', reason: parsed.reason };
  const now = dependencies.now ?? (() => new Date().toISOString());
  try {
    const updatedAt = now();
    await runKairosAtomicWrite(db, ['metadata'], async ({ repositories }) => {
      await repositories.metadata.put({ key: practiceMoneyMetadataKey, value: JSON.stringify({ version: 1, startAmount: parsed.money.startAmount, currency: parsed.money.currency }), updatedAt });
    });
    return { ok: true, money: parsed.money };
  } catch {
    return { ok: false, type: 'storage-error', reason: 'practice-money-save-failed' };
  }
}

const unavailable = (money: PracticeMoney, closedTrades: number, reason: PracticeMoneyUnavailableReason, resultCurrency: string | null): PracticeMoneyView =>
  Object.freeze({ kind: 'unavailable' as const, money, closedTrades, reason, resultCurrency });

/** What the money is now, from the aggregation owner's total, and the two bar lengths. It never works out a trade's result. */
export function projectPracticeMoney(money: PracticeMoney | null, results: VisualPnlAggregationSummary): PracticeMoneyView {
  if (money === null) return Object.freeze({ kind: 'not-set' as const });
  const steps = PRACTICE_MONEY_PICTURE_STEPS;
  if (!results.available) {
    switch (results.reason) {
      case 'no-trades':
        return Object.freeze({ kind: 'ready' as const, money, closedTrades: 0, resultSoFar: '0' as DecimalString, currentAmount: money.startAmount, outcome: 'breakeven' as const, startSteps: steps, currentSteps: steps });
      case 'unavailable-trade-outcome':
        return unavailable(money, results.tradeCount, 'trade-without-result', null);
      case 'missing-currency-evidence':
        return unavailable(money, results.tradeCount, 'missing-currency', null);
      case 'mixed-currencies':
        return unavailable(money, results.tradeCount, 'mixed-currencies', null);
      default:
        return unavailable(money, results.tradeCount, 'calculation-failed', null);
    }
  }
  if (results.currency !== money.currency) return unavailable(money, results.tradeCount, 'other-currency', results.currency);
  const current = decimalAdd(money.startAmount, results.total);
  if (!current.ok) return unavailable(money, results.tradeCount, 'calculation-failed', null);
  const order = decimalCompare(current.value, money.startAmount);
  if (order === null) return unavailable(money, results.tradeCount, 'calculation-failed', null);
  const startSteps = order === 1 ? decimalScaleToSteps(money.startAmount, current.value, steps) : steps;
  const currentSteps = order === 1 ? steps : decimalScaleToSteps(current.value, money.startAmount, steps);
  if (startSteps === null || currentSteps === null) return unavailable(money, results.tradeCount, 'calculation-failed', null);
  return Object.freeze({
    kind: 'ready' as const, money, closedTrades: results.tradeCount, resultSoFar: results.total, currentAmount: current.value, outcome: results.outcome, startSteps, currentSteps,
  });
}

/** The practice money and what it is now; with no money saved, no trade is read. A storage failure rejects. */
export async function loadPracticeMoney(db: KairosDatabase): Promise<PracticeMoneyView> {
  const money = await readPracticeMoney(createKairosRepositories(db).metadata);
  if (money === null) return Object.freeze({ kind: 'not-set' as const });
  // All time: no day is worked out, so the time zone is not used.
  const period = await listJournalClosedTradesInPeriod(db, { timeZone: 'UTC', fromDayKey: null, toDayKey: null, scope: 'practice' });
  if (!period.ok) throw new Error(`Practice money could not read your practice trades: ${period.reason}.`);
  return projectPracticeMoney(money, summarizeVisualPnlAggregation(period.entries.map((entry) => entry.visualPnl)));
}
