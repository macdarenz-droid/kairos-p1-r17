import type { DomainValidationResult } from '../trades/tradeValidation';
import {
  KAIROS_DISCIPLINE_MISTAKE_TAGS,
  KAIROS_DISCIPLINE_NOTE_MAX_LENGTH,
  KAIROS_POST_TRADE_REVIEW_KEYS,
  KAIROS_PRE_TRADE_CHECKLIST_KEYS,
  type LegacyTradeDisciplineRecord,
  type TradeDisciplineRecord,
} from './disciplineTypes';
import { KAIROS_DEFAULT_DISCIPLINE_LISTS, isDisciplineLabel, isDisciplineListItemId, type DisciplineListItem } from './disciplineLists';

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

function isItemAnswerList(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || !isDisciplineListItemId(entry.itemId) || !isDisciplineLabel(entry.label) || (entry.answer !== 'yes' && entry.answer !== 'no')) return false;
    if (seen.has(entry.itemId)) return false;
    seen.add(entry.itemId);
  }
  return true;
}
function isMistakeMarkList(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || !isDisciplineListItemId(entry.itemId) || !isDisciplineLabel(entry.label) || seen.has(entry.itemId)) return false;
    seen.add(entry.itemId);
  }
  return true;
}
function hasRecordFields(value: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.tradeId) &&
    typeof value.note === 'string' &&
    value.note.length <= KAIROS_DISCIPLINE_NOTE_MAX_LENGTH &&
    (value.checklistCompletedAt === null || isIsoMoment(value.checklistCompletedAt)) &&
    (value.reviewedAt === null || isIsoMoment(value.reviewedAt)) &&
    isIsoMoment(value.createdAt) &&
    isIsoMoment(value.updatedAt) &&
    value.updatedAt >= value.createdAt
  );
}

/**
 * Structural acceptance of a stored discipline record: shared by the
 * integrity check, export and backup format 7 validation, so a record is
 * accepted or refused by exactly one rule. Items are not compared with the
 * current lists: they may have been renamed or removed since. The legacy check
 * below is used only for formats 5–6 and the v8 upgrade. Trade existence is a
 * store-level reference check, not a record-shape check.
 */
export function isTradeDisciplineRecordShape(value: unknown): value is TradeDisciplineRecord {
  if (!isRecord(value)) return false;
  return (
    isItemAnswerList(value.preTradeChecklist) &&
    isItemAnswerList(value.postTradeReview) &&
    isMistakeMarkList(value.mistakes) &&
    hasRecordFields(value)
  );
}

/** The L36.1 shape (fixed keys), accepted only in format 5–6 backups and v6/v7 databases. */
export function isLegacyTradeDisciplineRecordShape(value: unknown): value is LegacyTradeDisciplineRecord {
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

const defaultLabel = (list: readonly DisciplineListItem[], id: string): string => {
  const item = list.find((candidate) => candidate.id === id);
  if (item === undefined) throw new Error('discipline-legacy-key-unknown');
  return item.label;
};

/** Converts an L36.1 record with the default labels; every other field and the order are kept. */
export function upgradeLegacyTradeDisciplineRecord(record: LegacyTradeDisciplineRecord): TradeDisciplineRecord {
  const lists = KAIROS_DEFAULT_DISCIPLINE_LISTS;
  return {
    id: record.id,
    tradeId: record.tradeId,
    preTradeChecklist: record.preTradeChecklist.map(({ key, answer }) => ({ itemId: key, label: defaultLabel(lists.checklist, key), answer })),
    postTradeReview: record.postTradeReview.map(({ key, answer }) => ({ itemId: key, label: defaultLabel(lists.review, key), answer })),
    mistakes: record.mistakes.map((tag) => ({ itemId: tag, label: defaultLabel(lists.mistakes, tag) })),
    note: record.note,
    checklistCompletedAt: record.checklistCompletedAt,
    reviewedAt: record.reviewedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function validateTradeDisciplineRecord(record: TradeDisciplineRecord): DomainValidationResult<TradeDisciplineRecord> {
  if (!isTradeDisciplineRecordShape(record)) return { ok: false, reason: 'invalid-discipline-record' };
  return { ok: true, value: record };
}
