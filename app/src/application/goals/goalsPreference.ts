import type { MetadataRepository } from '../../data/repositories';
import type { DecimalString } from '../../domain/trades/tradeTypes';
import { parsePositiveDecimalString } from '../../domain/trades/tradeValidation';

/**
 * P26.1 Goals preference: the user's own targets, persisted as one P5 metadata
 * record under a reserved key (no schema change, included in every backup like
 * the other user preferences). Missing or malformed evidence reads as "no goals
 * set"; nothing here computes progress, results or journal truth.
 */
export const goalsPreferenceMetadataKey = 'preferences.goals.v1';
export const GOALS_COUNT_TARGET_MAX = 10_000 as const;
const CURRENCY_PATTERN = /^[A-Z]{3,10}$/;

export interface GoalsMonthlyResultTarget {
  readonly amount: DecimalString;
  readonly currency: string;
}

export interface GoalsPreference {
  /** Closed trades the user wants to reach in a calendar month, or null when unset. */
  readonly tradesPerMonthTarget: number | null;
  /** The most trades the user allows themselves in one calendar day, or null when unset. */
  readonly maxTradesPerDay: number | null;
  /** The realized result the user wants to reach in a calendar month, in one currency, or null when unset. */
  readonly monthlyResultTarget: GoalsMonthlyResultTarget | null;
}

export const EMPTY_GOALS_PREFERENCE: GoalsPreference = Object.freeze({ tradesPerMonthTarget: null, maxTradesPerDay: null, monthlyResultTarget: null });

/** Everything as the user typed it; blank means unset. */
export interface GoalsPreferenceInput {
  readonly tradesPerMonthTarget?: string;
  readonly maxTradesPerDay?: string;
  readonly monthlyResultTargetAmount?: string;
  readonly monthlyResultTargetCurrency?: string;
}

export type GoalsPreferenceInvalidReason = 'trades-per-month-invalid' | 'max-trades-per-day-invalid' | 'monthly-result-target-amount-invalid' | 'monthly-result-target-currency-invalid';

export type GoalsPreferenceParseResult =
  | Readonly<{ ok: true; preference: GoalsPreference }>
  | Readonly<{ ok: false; reason: GoalsPreferenceInvalidReason }>;

export type GoalsPreferenceWriteResult = GoalsPreferenceParseResult;

const blank = (value: string | undefined): boolean => value === undefined || value.trim() === '';

function parseCountTarget(value: string | undefined): number | null | undefined {
  if (blank(value)) return null;
  const trimmed = value!.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const count = Number(trimmed);
  if (!Number.isSafeInteger(count) || count < 1 || count > GOALS_COUNT_TARGET_MAX) return undefined;
  return count;
}

/** Validates typed goal inputs into the stored preference; a blank field is an unset goal, never an error. */
export function parseGoalsPreferenceInput(input: GoalsPreferenceInput): GoalsPreferenceParseResult {
  const tradesPerMonthTarget = parseCountTarget(input.tradesPerMonthTarget);
  if (tradesPerMonthTarget === undefined) return Object.freeze({ ok: false as const, reason: 'trades-per-month-invalid' as const });
  const maxTradesPerDay = parseCountTarget(input.maxTradesPerDay);
  if (maxTradesPerDay === undefined) return Object.freeze({ ok: false as const, reason: 'max-trades-per-day-invalid' as const });
  let monthlyResultTarget: GoalsMonthlyResultTarget | null = null;
  const amountBlank = blank(input.monthlyResultTargetAmount), currencyBlank = blank(input.monthlyResultTargetCurrency);
  if (!amountBlank || !currencyBlank) {
    const amount = parsePositiveDecimalString(input.monthlyResultTargetAmount ?? '');
    if (!amount.ok) return Object.freeze({ ok: false as const, reason: 'monthly-result-target-amount-invalid' as const });
    const currency = (input.monthlyResultTargetCurrency ?? '').trim().toUpperCase();
    if (!CURRENCY_PATTERN.test(currency)) return Object.freeze({ ok: false as const, reason: 'monthly-result-target-currency-invalid' as const });
    monthlyResultTarget = Object.freeze({ amount: amount.value, currency });
  }
  return Object.freeze({ ok: true as const, preference: Object.freeze({ tradesPerMonthTarget, maxTradesPerDay, monthlyResultTarget }) });
}

function isStoredPreference(value: unknown): value is GoalsPreference {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const count = (v: unknown) => v === null || (typeof v === 'number' && Number.isSafeInteger(v) && v >= 1 && v <= GOALS_COUNT_TARGET_MAX);
  if (!count(record.tradesPerMonthTarget) || !count(record.maxTradesPerDay)) return false;
  const target = record.monthlyResultTarget;
  if (target === null) return true;
  if (typeof target !== 'object' || target === null) return false;
  const t = target as Record<string, unknown>;
  if (typeof t.amount !== 'string' || typeof t.currency !== 'string') return false;
  const amount = parsePositiveDecimalString(t.amount);
  return amount.ok && amount.value === t.amount && CURRENCY_PATTERN.test(t.currency);
}

/** Reads the stored goals through the authoritative metadata repository; missing or malformed evidence is "no goals set". */
export async function readGoalsPreference(metadata: MetadataRepository): Promise<GoalsPreference> {
  const stored = await metadata.get(goalsPreferenceMetadataKey);
  if (!stored) return EMPTY_GOALS_PREFERENCE;
  try {
    const parsed: unknown = JSON.parse(stored.value);
    if (typeof parsed !== 'object' || parsed === null || (parsed as Record<string, unknown>).version !== 1) return EMPTY_GOALS_PREFERENCE;
    const { version: _version, ...preference } = parsed as Record<string, unknown>;
    return isStoredPreference(preference) ? Object.freeze({ tradesPerMonthTarget: preference.tradesPerMonthTarget, maxTradesPerDay: preference.maxTradesPerDay, monthlyResultTarget: preference.monthlyResultTarget === null ? null : Object.freeze({ ...preference.monthlyResultTarget }) }) : EMPTY_GOALS_PREFERENCE;
  } catch {
    return EMPTY_GOALS_PREFERENCE;
  }
}

/** Persists only a valid preference; persistence stays owned by MetadataRepository. */
export async function writeGoalsPreference(metadata: MetadataRepository, input: GoalsPreferenceInput, updatedAt: string): Promise<GoalsPreferenceWriteResult> {
  const parsed = parseGoalsPreferenceInput(input);
  if (!parsed.ok) return parsed;
  await metadata.put({ key: goalsPreferenceMetadataKey, value: JSON.stringify({ version: 1, ...parsed.preference }), updatedAt });
  return parsed;
}

export async function clearGoalsPreference(metadata: MetadataRepository): Promise<void> {
  await metadata.delete(goalsPreferenceMetadataKey);
}
