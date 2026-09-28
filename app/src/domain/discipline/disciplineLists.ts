import {
  KAIROS_DISCIPLINE_MISTAKE_TAGS,
  KAIROS_POST_TRADE_REVIEW_KEYS,
  KAIROS_PRE_TRADE_CHECKLIST_KEYS,
  type DisciplineListItemId,
} from './disciplineTypes';

/**
 * P22.2 the trader's own discipline lists (D6): checklist items, review items
 * and mistake tags, each with a stable id and a plain-words label. This module
 * owns the items, their ids, labels, `ruleId`, defaults and validation; where
 * the lists are stored is the application preference's job.
 */
export type DisciplineListKind = 'checklist' | 'review' | 'mistakes';

export interface DisciplineListItem {
  readonly id: DisciplineListItemId;
  readonly label: string;
  /** `ruleId` is the P28 strategy rule this item checks; null until P28. */
  readonly ruleId: string | null;
}

export interface DisciplineLists {
  readonly checklist: readonly DisciplineListItem[];
  readonly review: readonly DisciplineListItem[];
  readonly mistakes: readonly DisciplineListItem[];
}

export const KAIROS_DISCIPLINE_LIST_MAX_ITEMS = 20;
export const KAIROS_DISCIPLINE_LABEL_MAX_LENGTH = 80;
export const KAIROS_DISCIPLINE_ITEM_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

const LIST_KINDS: readonly DisciplineListKind[] = Object.freeze(['checklist', 'review', 'mistakes'] as const);

export function isDisciplineListItemId(value: unknown): value is DisciplineListItemId {
  return typeof value === 'string' && KAIROS_DISCIPLINE_ITEM_ID_PATTERN.test(value);
}

export function isDisciplineLabel(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === value && value.length >= 1 && value.length <= KAIROS_DISCIPLINE_LABEL_MAX_LENGTH;
}

const defaultList = (ids: readonly string[], labels: Readonly<Record<string, string>>): readonly DisciplineListItem[] =>
  Object.freeze(ids.map((id) => Object.freeze({ id, label: labels[id], ruleId: null })));

/** Plain-words defaults; their ids are the L36.1 keys, in order. */
export const KAIROS_DEFAULT_DISCIPLINE_LISTS: DisciplineLists = Object.freeze({
  checklist: defaultList(KAIROS_PRE_TRADE_CHECKLIST_KEYS, {
    'plan-written': 'I wrote down my plan',
    'risk-defined': 'I know how much I can lose',
    'stop-placed': 'I set my stop',
    'size-within-limit': 'My trade size is within my limit',
    'setup-matches-rules': 'This trade fits my rules',
  }),
  review: defaultList(KAIROS_POST_TRADE_REVIEW_KEYS, {
    'followed-plan': 'I followed my plan',
    'respected-stop': 'I kept to my stop',
    'exit-per-plan': 'I closed the trade as planned',
    'emotions-in-check': 'I stayed calm',
  }),
  mistakes: defaultList(KAIROS_DISCIPLINE_MISTAKE_TAGS, {
    'no-plan': 'Traded without a plan',
    'moved-stop': 'Moved my stop',
    'oversized': 'Trade was too big',
    'chased-entry': 'Chased the price',
    'early-exit': 'Closed too early',
    'late-exit': 'Closed too late',
    'revenge-trade': 'Traded to win back a loss',
    'ignored-rules': 'Broke my rules',
  }),
});

/** A fresh id for an item the trader adds. */
export function createDisciplineListItemId(): DisciplineListItemId {
  return crypto.randomUUID();
}

export type DisciplineListsInvalidReason =
  | 'lists-missing'
  | 'too-many-items'
  | 'invalid-item-id'
  | 'duplicate-item-id'
  | 'label-required'
  | 'label-too-long'
  | 'invalid-rule-id';

export type DisciplineListsParseResult =
  | { readonly ok: true; readonly lists: DisciplineLists }
  | { readonly ok: false; readonly reason: DisciplineListsInvalidReason; readonly list: DisciplineListKind | null; readonly index: number | null };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const refuse = (reason: DisciplineListsInvalidReason, list: DisciplineListKind | null, index: number | null): DisciplineListsParseResult =>
  Object.freeze({ ok: false, reason, list, index });

/**
 * Checks the lists in the order checklist, review, mistakes; the first failure
 * wins. On success returns new frozen lists with trimmed labels, keeping only
 * `id`, `label` and `ruleId` on each item. Empty lists are allowed.
 */
export function parseDisciplineLists(value: unknown): DisciplineListsParseResult {
  if (!isPlainObject(value)) return refuse('lists-missing', null, null);
  const parsed: Partial<Record<DisciplineListKind, readonly DisciplineListItem[]>> = {};
  for (const kind of LIST_KINDS) {
    const list = value[kind];
    if (!Array.isArray(list)) return refuse('lists-missing', kind, null);
    if (list.length > KAIROS_DISCIPLINE_LIST_MAX_ITEMS) return refuse('too-many-items', kind, null);
    const seen = new Set<string>();
    const items: DisciplineListItem[] = [];
    for (let index = 0; index < list.length; index += 1) {
      const item: unknown = list[index];
      if (!isPlainObject(item) || !isDisciplineListItemId(item.id)) return refuse('invalid-item-id', kind, index);
      if (seen.has(item.id)) return refuse('duplicate-item-id', kind, index);
      seen.add(item.id);
      if (typeof item.label !== 'string' || item.label.trim().length === 0) return refuse('label-required', kind, index);
      const label = item.label.trim();
      if (label.length > KAIROS_DISCIPLINE_LABEL_MAX_LENGTH) return refuse('label-too-long', kind, index);
      const ruleId = item.ruleId === undefined ? null : item.ruleId;
      if (ruleId !== null && !isDisciplineListItemId(ruleId)) return refuse('invalid-rule-id', kind, index);
      items.push(Object.freeze({ id: item.id, label, ruleId }));
    }
    parsed[kind] = Object.freeze(items);
  }
  return Object.freeze({
    ok: true,
    lists: Object.freeze({ checklist: parsed.checklist!, review: parsed.review!, mistakes: parsed.mistakes! }),
  });
}
