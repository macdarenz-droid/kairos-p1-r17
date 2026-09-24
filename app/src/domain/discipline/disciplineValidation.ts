import type { DomainValidationResult } from '../trades/tradeValidation';
import {
  KAIROS_DISCIPLINE_MISTAKE_TAGS,
  KAIROS_DISCIPLINE_NOTE_MAX_LENGTH,
  KAIROS_POST_TRADE_REVIEW_KEYS,
  KAIROS_PRE_TRADE_CHECKLIST_KEYS,
  type TradeDisciplineRecord,
} from './disciplineTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function isIsoMoment(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}
function isAnswerList(value: unknown, keys: readonly string[]): boolean {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.key !== 'string' || !keys.includes(entry.key) || (entry.answer !== 'yes' && entry.answer !== 'no')) return false;
    if (seen.has(entry.key)) return false;
    seen.add(entry.key);
  }
  return true;
}
function isMistakeList(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  for (const tag of value) {
    if (typeof tag !== 'string' || !(KAIROS_DISCIPLINE_MISTAKE_TAGS as readonly string[]).includes(tag) || seen.has(tag)) return false;
    seen.add(tag);
  }
  return true;
}

/**
 * Structural acceptance of a stored discipline record: shared by the P36.1
 * integrity check and the backup V5 validation so a record is accepted or
 * refused by exactly one rule. Trade existence is a store-level reference
 * check, not a record-shape check.
 */
export function isTradeDisciplineRecordShape(value: unknown): value is TradeDisciplineRecord {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.tradeId) &&
    isAnswerList(value.preTradeChecklist, KAIROS_PRE_TRADE_CHECKLIST_KEYS) &&
    isAnswerList(value.postTradeReview, KAIROS_POST_TRADE_REVIEW_KEYS) &&
    isMistakeList(value.mistakes) &&
    typeof value.note === 'string' &&
    value.note.length <= KAIROS_DISCIPLINE_NOTE_MAX_LENGTH &&
    (value.checklistCompletedAt === null || isIsoMoment(value.checklistCompletedAt)) &&
    (value.reviewedAt === null || isIsoMoment(value.reviewedAt)) &&
    isIsoMoment(value.createdAt) &&
    isIsoMoment(value.updatedAt) &&
    value.updatedAt >= value.createdAt
  );
}

export function validateTradeDisciplineRecord(record: TradeDisciplineRecord): DomainValidationResult<TradeDisciplineRecord> {
  if (!isTradeDisciplineRecordShape(record)) return { ok: false, reason: 'invalid-discipline-record' };
  return { ok: true, value: record };
}
