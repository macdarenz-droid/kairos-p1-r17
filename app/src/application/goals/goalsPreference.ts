import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories, type MetadataRepository } from '../../data/repositories';
import { decimalCompare } from '../../domain/calculations/decimalKernel';
import type { DecimalString } from '../../domain/trades/tradeTypes';
import { parsePositiveDecimalString } from '../../domain/trades/tradeValidation';
import type { DatabaseMetadataRecord } from '../../data/database';
import { projectVisualPnlDayKey, visualPnlTimeZonePreferenceMetadataKey } from '../visual-pnl';

/**
 * P26.1 Goals preference: the user's own targets, persisted as one P5 metadata
 * record under a reserved key (no schema change, included in every backup like
 * the other user preferences). Missing or malformed evidence reads as "no goals
 * set"; nothing here computes progress, results or journal truth.
 *
 * U13 (D246): version 2 keeps a history, `{ version: 2, periods: [{ from, goals }] }`, so a past day or month is judged by
 * the goals in force then. Version 1 is read as one period from the day it was saved; the first save writes version 2.
 */
export const goalsPreferenceMetadataKey = 'preferences.goals.v1';
export const GOALS_COUNT_TARGET_MAX = 10_000 as const;
/** The most periods kept; past it, the oldest goes first. */
export const GOALS_PERIODS_MAX = 100 as const;
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
  /** U13 (D247): the most the user can lose in a day and in a week, in one currency, or null when unset. */
  readonly lossLimits: GoalsLossLimits | null;
  /** U13 (D248): every trade closed gets its review; every trade has every checklist step ticked. */
  readonly reviewEveryTrade: boolean;
  readonly tickEveryStep: boolean;
}

/** At least one of the two is set; a week limit is never below the day limit. */
export interface GoalsLossLimits {
  readonly currency: string;
  readonly perDay: DecimalString | null;
  readonly perWeek: DecimalString | null;
}

export const EMPTY_GOALS_PREFERENCE: GoalsPreference = Object.freeze({
  tradesPerMonthTarget: null, maxTradesPerDay: null, monthlyResultTarget: null, lossLimits: null, reviewEveryTrade: false, tickEveryStep: false,
});

/** The goals in force from `from` (a day, YYYY-MM-DD, in the saved time zone) until the next period. */
export interface GoalsPeriod {
  readonly from: string;
  readonly goals: GoalsPreference;
}

/** Oldest first, at least one period, `from` strictly increasing. */
export interface GoalsSettings {
  readonly periods: readonly GoalsPeriod[];
}

/** Everything as the user typed it; blank means unset. */
export interface GoalsPreferenceInput {
  readonly tradesPerMonthTarget?: string;
  readonly maxTradesPerDay?: string;
  readonly monthlyResultTargetAmount?: string;
  readonly monthlyResultTargetCurrency?: string;
  readonly lossLimitPerDay?: string;
  readonly lossLimitPerWeek?: string;
  readonly lossLimitCurrency?: string;
  readonly reviewEveryTrade?: boolean;
  readonly tickEveryStep?: boolean;
}

export type GoalsPreferenceInvalidReason =
  | 'trades-per-month-invalid' | 'max-trades-per-day-invalid' | 'monthly-result-target-amount-invalid' | 'monthly-result-target-currency-invalid'
  | 'loss-limit-per-day-invalid' | 'loss-limit-per-week-invalid' | 'loss-limit-currency-invalid' | 'loss-limit-week-below-day';

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
  // Both amounts blank means no loss limits; the currency alone is ignored (the form fills it in).
  let lossLimits: GoalsLossLimits | null = null;
  const dayBlank = blank(input.lossLimitPerDay), weekBlank = blank(input.lossLimitPerWeek);
  if (!dayBlank || !weekBlank) {
    const perDay = dayBlank ? null : parsePositiveDecimalString(input.lossLimitPerDay ?? '');
    if (perDay !== null && !perDay.ok) return Object.freeze({ ok: false as const, reason: 'loss-limit-per-day-invalid' as const });
    const perWeek = weekBlank ? null : parsePositiveDecimalString(input.lossLimitPerWeek ?? '');
    if (perWeek !== null && !perWeek.ok) return Object.freeze({ ok: false as const, reason: 'loss-limit-per-week-invalid' as const });
    const currency = (input.lossLimitCurrency ?? '').trim().toUpperCase();
    if (!CURRENCY_PATTERN.test(currency)) return Object.freeze({ ok: false as const, reason: 'loss-limit-currency-invalid' as const });
    if (perDay !== null && perWeek !== null && decimalCompare(perWeek.value, perDay.value) === -1) return Object.freeze({ ok: false as const, reason: 'loss-limit-week-below-day' as const });
    lossLimits = Object.freeze({ currency, perDay: perDay?.value ?? null, perWeek: perWeek?.value ?? null });
  }
  return Object.freeze({ ok: true as const, preference: goalsOf({
    tradesPerMonthTarget, maxTradesPerDay, monthlyResultTarget, lossLimits,
    reviewEveryTrade: input.reviewEveryTrade === true, tickEveryStep: input.tickEveryStep === true,
  }) });
}

/** One key order, so two equal goals serialize the same. */
function goalsOf(goals: GoalsPreference): GoalsPreference {
  return Object.freeze({
    tradesPerMonthTarget: goals.tradesPerMonthTarget,
    maxTradesPerDay: goals.maxTradesPerDay,
    monthlyResultTarget: goals.monthlyResultTarget === null ? null : Object.freeze({ amount: goals.monthlyResultTarget.amount, currency: goals.monthlyResultTarget.currency }),
    lossLimits: goals.lossLimits === null ? null : Object.freeze({ currency: goals.lossLimits.currency, perDay: goals.lossLimits.perDay, perWeek: goals.lossLimits.perWeek }),
    reviewEveryTrade: goals.reviewEveryTrade,
    tickEveryStep: goals.tickEveryStep,
  });
}

/** For the form: the goals as the fields show them (blank when unset). */
export function goalsPreferenceInputOf(preference: GoalsPreference): Required<GoalsPreferenceInput> {
  return Object.freeze({
    tradesPerMonthTarget: preference.tradesPerMonthTarget === null ? '' : String(preference.tradesPerMonthTarget),
    maxTradesPerDay: preference.maxTradesPerDay === null ? '' : String(preference.maxTradesPerDay),
    monthlyResultTargetAmount: preference.monthlyResultTarget?.amount ?? '',
    monthlyResultTargetCurrency: preference.monthlyResultTarget?.currency ?? '',
    lossLimitPerDay: preference.lossLimits?.perDay ?? '',
    lossLimitPerWeek: preference.lossLimits?.perWeek ?? '',
    lossLimitCurrency: preference.lossLimits?.currency ?? '',
    reviewEveryTrade: preference.reviewEveryTrade,
    tickEveryStep: preference.tickEveryStep,
  });
}

/** True when no goal at all is set. */
export function hasNoGoals(goals: GoalsPreference): boolean {
  return goals.tradesPerMonthTarget === null && goals.maxTradesPerDay === null && goals.monthlyResultTarget === null
    && goals.lossLimits === null && !goals.reviewEveryTrade && !goals.tickEveryStep;
}

const isCount = (v: unknown) => v === null || (typeof v === 'number' && Number.isSafeInteger(v) && v >= 1 && v <= GOALS_COUNT_TARGET_MAX);
const isRecordValue = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const hasKeys = (record: Record<string, unknown>, keys: readonly string[]) => {
  const own = Object.keys(record);
  return own.length === keys.length && keys.every(key => own.includes(key));
};
const isCanonicalAmount = (v: unknown): v is DecimalString => {
  if (typeof v !== 'string') return false;
  const amount = parsePositiveDecimalString(v);
  return amount.ok && amount.value === v;
};

function isStoredResultTarget(target: unknown): boolean {
  if (target === null) return true;
  return isRecordValue(target) && isCanonicalAmount(target.amount) && typeof target.currency === 'string' && CURRENCY_PATTERN.test(target.currency);
}

/** Version 1, as read since P26.1. */
function isStoredPreference(value: unknown): value is Pick<GoalsPreference, 'tradesPerMonthTarget' | 'maxTradesPerDay' | 'monthlyResultTarget'> {
  if (!isRecordValue(value)) return false;
  if (!isCount(value.tradesPerMonthTarget) || !isCount(value.maxTradesPerDay)) return false;
  return isStoredResultTarget(value.monthlyResultTarget);
}

const GOALS_KEYS = ['tradesPerMonthTarget', 'maxTradesPerDay', 'monthlyResultTarget', 'lossLimits', 'reviewEveryTrade', 'tickEveryStep'] as const;

/** Version 2's goals: exact keys at every level, canonical amounts, a week limit never below the day limit. */
function isStoredGoals(value: unknown): value is GoalsPreference {
  if (!isRecordValue(value) || !hasKeys(value, GOALS_KEYS)) return false;
  if (!isCount(value.tradesPerMonthTarget) || !isCount(value.maxTradesPerDay)) return false;
  const target = value.monthlyResultTarget;
  if (target !== null && !(isRecordValue(target) && hasKeys(target, ['amount', 'currency']) && isStoredResultTarget(target))) return false;
  if (typeof value.reviewEveryTrade !== 'boolean' || typeof value.tickEveryStep !== 'boolean') return false;
  const limits = value.lossLimits;
  if (limits === null) return true;
  if (!isRecordValue(limits) || !hasKeys(limits, ['currency', 'perDay', 'perWeek'])) return false;
  if (typeof limits.currency !== 'string' || !CURRENCY_PATTERN.test(limits.currency)) return false;
  const perDay = limits.perDay, perWeek = limits.perWeek;
  if ((perDay !== null && !isCanonicalAmount(perDay)) || (perWeek !== null && !isCanonicalAmount(perWeek))) return false;
  if (perDay === null && perWeek === null) return false;
  return perDay === null || perWeek === null || decimalCompare(perWeek, perDay) !== -1;
}

const isDayKey = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const time = Date.parse(`${v}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === v;
};

function isStoredSettings(value: Record<string, unknown>): boolean {
  if (!hasKeys(value, ['version', 'periods']) || !Array.isArray(value.periods)) return false;
  const periods: unknown[] = value.periods;
  if (periods.length < 1 || periods.length > GOALS_PERIODS_MAX) return false;
  let previous = '';
  for (const period of periods) {
    if (!isRecordValue(period) || !hasKeys(period, ['from', 'goals']) || !isDayKey(period.from) || !isStoredGoals(period.goals)) return false;
    if (period.from <= previous) return false;
    previous = period.from;
  }
  return true;
}

/** The day of `instant` in the saved time zone, or in UTC when none is saved (or it can't be read). */
function savedDayKey(zoneRecord: DatabaseMetadataRecord | undefined, instant: string): string {
  const day = projectVisualPnlDayKey(instant, zoneRecord?.value ?? 'UTC');
  if (day.available) return day.dayKey;
  const utc = projectVisualPnlDayKey(instant, 'UTC');
  return utc.available ? utc.dayKey : instant.slice(0, 10);
}

/** The stored goals record as settings: version 1 is one period from the day it was saved; anything malformed is null. */
function settingsFrom(stored: DatabaseMetadataRecord | undefined, zoneRecord: DatabaseMetadataRecord | undefined): GoalsSettings | null {
  if (!stored) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(stored.value); } catch { return null; }
  if (!isRecordValue(parsed)) return null;
  if (parsed.version === 1) {
    const { version: _version, ...preference } = parsed;
    if (!isStoredPreference(preference)) return null;
    const goals = goalsOf({ ...EMPTY_GOALS_PREFERENCE, tradesPerMonthTarget: preference.tradesPerMonthTarget, maxTradesPerDay: preference.maxTradesPerDay, monthlyResultTarget: preference.monthlyResultTarget });
    return Object.freeze({ periods: Object.freeze([Object.freeze({ from: savedDayKey(zoneRecord, stored.updatedAt), goals })]) });
  }
  if (parsed.version !== 2 || !isStoredSettings(parsed)) return null;
  const periods = (parsed.periods as GoalsPeriod[]).map(period => Object.freeze({ from: period.from, goals: goalsOf(period.goals) }));
  return Object.freeze({ periods: Object.freeze(periods) });
}

/** D246: every period of the stored goals (see `settingsFrom`); missing or malformed evidence is null. */
export async function readGoalsSettings(metadata: MetadataRepository): Promise<GoalsSettings | null> {
  const stored = await metadata.get(goalsPreferenceMetadataKey);
  const zoneRecord = await metadata.get(visualPnlTimeZonePreferenceMetadataKey);
  return settingsFrom(stored, zoneRecord);
}

/** D246: the goals in force on a day: the last period from on or before it; null before the first period or when every goal is off. */
export function goalsInForceOn(settings: GoalsSettings | null, dayKey: string): GoalsPreference | null {
  if (settings === null) return null;
  let inForce: GoalsPreference | null = null;
  for (const period of settings.periods) if (period.from <= dayKey) inForce = period.goals;
  return inForce === null || hasNoGoals(inForce) ? null : inForce;
}

/** Reads the goals in force now (the last period) through the authoritative metadata repository; missing or malformed evidence is "no goals set". */
export async function readGoalsPreference(metadata: MetadataRepository): Promise<GoalsPreference> {
  const settings = await readGoalsSettings(metadata);
  return settings?.periods[settings.periods.length - 1]!.goals ?? EMPTY_GOALS_PREFERENCE;
}

const sameGoals = (a: GoalsPreference, b: GoalsPreference) => JSON.stringify(goalsOf(a)) === JSON.stringify(goalsOf(b));

/**
 * Persists only a valid preference; persistence stays owned by MetadataRepository. D246: the goals apply from the day of
 * `updatedAt` in the saved time zone: a save on the last period's day replaces it, equal goals add nothing, and past
 * GOALS_PERIODS_MAX periods the oldest goes.
 */
export async function writeGoalsPreference(metadata: MetadataRepository, input: GoalsPreferenceInput, updatedAt: string): Promise<GoalsPreferenceWriteResult> {
  const parsed = parseGoalsPreferenceInput(input);
  if (!parsed.ok) return parsed;
  // Read here, not through a helper: inside the save's transaction, a nested async read let it commit too early.
  const stored = await metadata.get(goalsPreferenceMetadataKey);
  const zoneRecord = await metadata.get(visualPnlTimeZonePreferenceMetadataKey);
  const settings = settingsFrom(stored, zoneRecord);
  const today = savedDayKey(zoneRecord, updatedAt);
  let periods: GoalsPeriod[] = [...(settings?.periods ?? [])];
  const last = periods[periods.length - 1];
  if (last !== undefined && sameGoals(last.goals, parsed.preference)) return parsed;
  if (last !== undefined && last.from >= today) {
    // Today's period (or one dated later, when the clock went back) takes the new goals; changing them back to the
    // goals before it leaves no period behind.
    periods = periods.slice(0, -1);
    const before = periods[periods.length - 1];
    if (before === undefined || !sameGoals(before.goals, parsed.preference)) periods.push({ from: last.from, goals: parsed.preference });
  } else {
    periods.push({ from: today, goals: parsed.preference });
  }
  periods = periods.slice(-GOALS_PERIODS_MAX);
  await metadata.put({ key: goalsPreferenceMetadataKey, value: JSON.stringify({ version: 2, periods }), updatedAt });
  return parsed;
}

export async function clearGoalsPreference(metadata: MetadataRepository): Promise<void> {
  await metadata.delete(goalsPreferenceMetadataKey);
}

/** For screens, which never import data/repositories: the stored goals (none when missing or damaged). */
export function loadGoalsPreference(db: KairosDatabase): Promise<GoalsPreference> {
  return readGoalsPreference(createKairosRepositories(db).metadata);
}

/** For screens: save the goals as typed, as one atomic write; an invalid input saves nothing (T-053d, the setup's first goal). */
export function saveGoalsPreference(db: KairosDatabase, input: GoalsPreferenceInput, dependencies: { readonly now?: () => string } = {}): Promise<GoalsPreferenceWriteResult> {
  const updatedAt = (dependencies.now ?? (() => new Date().toISOString()))();
  return runKairosAtomicWrite(db, ['metadata'], ({ repositories }) => writeGoalsPreference(repositories.metadata, input, updatedAt));
}
