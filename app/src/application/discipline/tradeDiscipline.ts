import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories, type KairosRepositories } from '../../data/repositories';
import {
  KAIROS_DEFAULT_DISCIPLINE_LISTS,
  KAIROS_DISCIPLINE_NOTE_MAX_LENGTH,
  createTradeDisciplineId,
  isTradeBeforeSaveNote,
  isTradeDisciplineRecordShape,
  validateTradeDisciplineRecord,
  type BeforeYouSaveKind,
  type DisciplineAnswer,
  type DisciplineItemAnswer,
  type DisciplineListItem,
  type DisciplineListItemId,
  type DisciplineLists,
  type DisciplineMistakeMark,
  type Strategy,
  type StrategyId,
  type TradeDisciplineId,
  type TradeDisciplineRecord,
  type TradeStrategyMark,
} from '../../domain/discipline';
import type { TradeId } from '../../domain/trades';
import { JOURNAL_HISTORY_SOURCES, type JournalHistoryScope } from '../journal/historyQuery';
import { readDisciplineLists } from './disciplineListsPreference';
import { readStrategies } from './strategies';

export interface DisciplineAnswerInput {
  readonly itemId: DisciplineListItemId;
  readonly answer: DisciplineAnswer;
}

export type SaveTradeDisciplineInput =
  | { readonly tradeId: TradeId; readonly scope: JournalHistoryScope; readonly half: 'checklist'; readonly answers: readonly DisciplineAnswerInput[] }
  | { readonly tradeId: TradeId; readonly scope: JournalHistoryScope; readonly half: 'review'; readonly answers: readonly DisciplineAnswerInput[]; readonly mistakeIds: readonly DisciplineListItemId[]; readonly note: string }
  /** P28: choose, keep or clear (null) the strategy this trade follows; `answers` tick its written rules (`itemId` is the rule id). */
  | { readonly tradeId: TradeId; readonly scope: JournalHistoryScope; readonly half: 'strategy'; readonly strategyId: StrategyId | null; readonly answers: readonly DisciplineAnswerInput[] };

export interface SaveTradeDisciplineDependencies {
  readonly now?: () => string;
  readonly createId?: () => TradeDisciplineId;
}

export type SaveTradeDisciplineResult =
  | { readonly ok: true; readonly record: TradeDisciplineRecord; readonly created: boolean }
  | { readonly ok: false; readonly type: 'validation-error'; readonly reason: 'nothing-to-save' | 'duplicate-item' | 'unknown-item' | 'note-too-long' }
  | { readonly ok: false; readonly type: 'not-found'; readonly reason: 'trade-not-found' | 'strategy-not-found' }
  | { readonly ok: false; readonly type: 'not-allowed'; readonly reason: 'trade-not-in-scope' | 'trade-status-not-allowed' }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'discipline-save-failed' };

const hasRepeat = (ids: readonly string[]): boolean => new Set(ids).size !== ids.length;

/**
 * P22.2 the only writer of a trade's discipline record. It saves one part in
 * one atomic write: the pre-trade checklist (draft or open trades), the
 * post-trade review with mistakes and a note (closed trades), or (P28) the
 * strategy the trade follows (any status). Choosing a strategy copies its
 * rules, so a later change or delete never changes how this trade is judged. Each label is
 * taken from the trader's lists at that moment. The caller names its scope,
 * so a Journal card cannot write for a practice trade or the other way round.
 * The trade record is never written.
 */
export async function saveTradeDiscipline(
  db: KairosDatabase,
  input: SaveTradeDisciplineInput,
  dependencies: SaveTradeDisciplineDependencies = {},
): Promise<SaveTradeDisciplineResult> {
  const mistakeIds = input.half === 'review' ? input.mistakeIds : [];
  const note = input.half === 'review' ? input.note.trim() : '';
  if (hasRepeat(input.answers.map((answer) => answer.itemId)) || hasRepeat(mistakeIds)) return { ok: false, type: 'validation-error', reason: 'duplicate-item' };
  if (note.length > KAIROS_DISCIPLINE_NOTE_MAX_LENGTH) return { ok: false, type: 'validation-error', reason: 'note-too-long' };
  if (input.half !== 'strategy' && input.answers.length === 0 && (input.half === 'checklist' || (mistakeIds.length === 0 && note === ''))) {
    return { ok: false, type: 'validation-error', reason: 'nothing-to-save' };
  }
  if (input.half === 'strategy' && input.strategyId === null && input.answers.length > 0) return { ok: false, type: 'validation-error', reason: 'unknown-item' };

  const now = dependencies.now ?? (() => new Date().toISOString());
  const createId = dependencies.createId ?? createTradeDisciplineId;
  try {
    const at = now();
    return await runKairosAtomicWrite(db, ['metadata', 'trades', 'tradeDiscipline'], async ({ repositories }): Promise<SaveTradeDisciplineResult> => {
      const trade = await repositories.trades.get(input.tradeId);
      if (!trade) return { ok: false, type: 'not-found', reason: 'trade-not-found' };
      if (!JOURNAL_HISTORY_SOURCES[input.scope].includes(trade.source)) return { ok: false, type: 'not-allowed', reason: 'trade-not-in-scope' };
      // The strategy part has no status rule: a strategy may be named at any status, and linkedAt records when.
      if (input.half === 'strategy') return await saveStrategyHalf(repositories, input, at, createId);
      // Status rule: a checklist answered after the trade closed would be hindsight; a review needs a closed trade.
      const statusAllowed = input.half === 'checklist' ? trade.status === 'draft' || trade.status === 'open' : trade.status === 'closed';
      if (!statusAllowed) return { ok: false, type: 'not-allowed', reason: 'trade-status-not-allowed' };

      const existing = await repositories.tradeDiscipline.getByTradeId(input.tradeId);
      const saved = existing !== undefined && isTradeDisciplineRecordShape(existing) ? existing : null;
      // A damaged record is replaced by the trader's new answers; an earlier backup still holds it.
      const start = existing === undefined ? emptyTradeDisciplineRecord(createId(), input.tradeId, at) : saved ?? emptyTradeDisciplineRecord((existing as Pick<TradeDisciplineRecord, 'id'>).id, input.tradeId, at);
      let record: TradeDisciplineRecord;
      if (input.half === 'checklist') {
        // Read directly in this write, as before U12: a version that read the lists and strategies through one more async helper
        // made the write commit early in tests (Dexie PrematureCommitError); the cause was not pinned down, so keep this shape.
        const lists = await readDisciplineLists(repositories.metadata);
        const built = buildTradeDisciplineRecord(start, saved, { checklist: input.answers }, at, { lists, strategies: [] });
        if (!built.ok) return partsRefused(built.failure);
        record = built.record;
      } else {
        const lists = await readDisciplineLists(repositories.metadata);
        const answerLabels = labelsFrom(lists.review, saved?.postTradeReview ?? []);
        const mistakeLabels = labelsFrom(lists.mistakes, saved?.mistakes ?? []);
        const answers: DisciplineItemAnswer[] = [];
        for (const { itemId, answer } of input.answers) {
          const label = answerLabels.get(itemId);
          if (label === undefined) return { ok: false, type: 'validation-error', reason: 'unknown-item' };
          answers.push({ itemId, label, answer });
        }
        const mistakes: DisciplineMistakeMark[] = [];
        for (const itemId of mistakeIds) {
          const label = mistakeLabels.get(itemId);
          if (label === undefined) return { ok: false, type: 'validation-error', reason: 'unknown-item' };
          mistakes.push({ itemId, label });
        }
        const updatedAt = at >= start.createdAt ? at : start.createdAt;
        record = { ...start, postTradeReview: answers, mistakes, note, reviewedAt: at, updatedAt };
      }
      const valid = validateTradeDisciplineRecord(record);
      if (!valid.ok) throw new Error(valid.reason);
      await repositories.tradeDiscipline.put(record);
      return { ok: true, record, created: existing === undefined };
    });
  } catch {
    return { ok: false, type: 'storage-error', reason: 'discipline-save-failed' };
  }
}

/** An empty discipline record for one trade, as the first save of any part starts it. */
export const emptyTradeDisciplineRecord = (id: TradeDisciplineId, tradeId: TradeId, at: string): TradeDisciplineRecord => ({
  id, tradeId, preTradeChecklist: [], postTradeReview: [], mistakes: [], note: '',
  checklistCompletedAt: null, reviewedAt: null, createdAt: at, updatedAt: at,
});

/** P28: choose (snapshotting the strategy's rules), keep and tick, or clear the strategy of one trade. */
async function saveStrategyHalf(
  repositories: KairosRepositories,
  input: Extract<SaveTradeDisciplineInput, { half: 'strategy' }>,
  at: string,
  createId: () => TradeDisciplineId,
): Promise<SaveTradeDisciplineResult> {
  const existing = await repositories.tradeDiscipline.getByTradeId(input.tradeId);
  const saved = existing !== undefined && isTradeDisciplineRecordShape(existing) ? existing : null;
  if (input.strategyId === null && existing === undefined) return { ok: false, type: 'validation-error', reason: 'nothing-to-save' };
  // A damaged record is replaced; an earlier backup still holds it.
  const start = existing === undefined ? emptyTradeDisciplineRecord(createId(), input.tradeId, at) : saved ?? emptyTradeDisciplineRecord((existing as Pick<TradeDisciplineRecord, 'id'>).id, input.tradeId, at);
  const strategies = input.strategyId === null ? [] : await readStrategies(repositories.metadata);
  const built = buildTradeDisciplineRecord(start, saved, { strategy: { strategyId: input.strategyId, answers: input.answers } }, at, { lists: KAIROS_DEFAULT_DISCIPLINE_LISTS, strategies });
  if (!built.ok) return partsRefused(built.failure);
  const valid = validateTradeDisciplineRecord(built.record);
  if (!valid.ok) throw new Error(valid.reason);
  await repositories.tradeDiscipline.put(built.record);
  return { ok: true, record: built.record, created: existing === undefined };
}

/** U12 (D241): the parts a trade's discipline record is built from: the checklist, the strategy and its written-rule ticks, and what "Before you save" named. */
export interface TradeDisciplineParts {
  readonly checklist?: readonly DisciplineAnswerInput[];
  readonly strategy?: Readonly<{ strategyId: StrategyId | null; answers: readonly DisciplineAnswerInput[] }>;
  readonly beforeSave?: Readonly<{ notes: readonly BeforeYouSaveKind[]; reason: string | null }>;
}
export type TradeDisciplinePartsFailure =
  | Readonly<{ part: 'checklist' | 'strategy' | 'beforeSave'; type: 'validation-error'; reason: 'duplicate-item' | 'unknown-item' | 'invalid-before-save' }>
  | Readonly<{ part: 'strategy'; type: 'not-found'; reason: 'strategy-not-found' }>;

/** Labels as the record keeps them: from the trader's current list; an id no longer listed keeps the words already saved on this trade. */
function labelsFrom(items: readonly DisciplineListItem[], savedMarks: readonly { readonly itemId: string; readonly label: string }[]): Map<string, string> {
  const labels = new Map(savedMarks.map((mark) => [mark.itemId, mark.label]));
  for (const item of items) labels.set(item.id, item.label);
  return labels;
}

function partsRefused(failure: TradeDisciplinePartsFailure): SaveTradeDisciplineResult {
  if (failure.type === 'not-found') return { ok: false, type: 'not-found', reason: failure.reason };
  return { ok: false, type: 'validation-error', reason: failure.reason === 'duplicate-item' ? 'duplicate-item' : 'unknown-item' };
}

/** The trader's lists and strategies a record is built from, read inside the caller's write. */
export interface TradeDisciplineSources { readonly lists: DisciplineLists; readonly strategies: readonly Strategy[] }

/**
 * U12 (D241): the one builder of a trade's discipline record from its parts, used by `saveTradeDiscipline` and by a trade
 * saved with what was ticked before it. Each label is taken from the trader's lists at that moment, and a chosen strategy's
 * rules are copied, so a later change never changes how this trade is judged. It reads and writes nothing; the caller reads
 * the lists (`readDisciplineLists`) and strategies (`readStrategies`) directly inside its write and keeps its own status rules.
 */
export function buildTradeDisciplineRecord(
  start: TradeDisciplineRecord,
  saved: TradeDisciplineRecord | null,
  parts: TradeDisciplineParts,
  at: string,
  sources: TradeDisciplineSources,
): Readonly<{ ok: true; record: TradeDisciplineRecord }> | Readonly<{ ok: false; failure: TradeDisciplinePartsFailure }> {
  const refuse = (failure: TradeDisciplinePartsFailure) => ({ ok: false as const, failure });
  let record: TradeDisciplineRecord = start;
  if (parts.checklist !== undefined) {
    if (hasRepeat(parts.checklist.map(answer => answer.itemId))) return refuse({ part: 'checklist', type: 'validation-error', reason: 'duplicate-item' });
    const labels = labelsFrom(sources.lists.checklist, saved?.preTradeChecklist ?? []);
    const answers: DisciplineItemAnswer[] = [];
    for (const { itemId, answer } of parts.checklist) {
      const label = labels.get(itemId);
      if (label === undefined) return refuse({ part: 'checklist', type: 'validation-error', reason: 'unknown-item' });
      answers.push({ itemId, label, answer });
    }
    record = { ...record, preTradeChecklist: answers, checklistCompletedAt: at };
  }
  if (parts.strategy !== undefined) {
    const { strategyId, answers } = parts.strategy;
    if (hasRepeat(answers.map(answer => answer.itemId))) return refuse({ part: 'strategy', type: 'validation-error', reason: 'duplicate-item' });
    if (strategyId === null) {
      if (answers.length > 0) return refuse({ part: 'strategy', type: 'validation-error', reason: 'unknown-item' });
      const { strategy: _drop, ...rest } = record;
      record = rest;
    } else {
      let base: TradeStrategyMark;
      if (saved?.strategy?.strategyId === strategyId) {
        base = saved.strategy;
      } else {
        const strategy = sources.strategies.find(item => item.id === strategyId);
        if (!strategy) return refuse({ part: 'strategy', type: 'not-found', reason: 'strategy-not-found' });
        base = { strategyId: strategy.id, revision: strategy.revision, name: strategy.name, rules: strategy.rules, answers: [], linkedAt: at };
      }
      const written = new Set(base.rules.filter(rule => rule.kind === 'written').map(rule => rule.id));
      if (answers.some(answer => !written.has(answer.itemId))) return refuse({ part: 'strategy', type: 'validation-error', reason: 'unknown-item' });
      record = { ...record, strategy: { ...base, answers: answers.map(({ itemId, answer }) => ({ ruleId: itemId, answer })) } };
    }
  }
  if (parts.beforeSave !== undefined) {
    const note = { notes: [...parts.beforeSave.notes], reason: parts.beforeSave.reason?.trim() || null, at };
    if (!isTradeBeforeSaveNote(note)) return refuse({ part: 'beforeSave', type: 'validation-error', reason: 'invalid-before-save' });
    record = { ...record, beforeSave: note };
  }
  return { ok: true, record: { ...record, updatedAt: at >= start.createdAt ? at : start.createdAt } };
}

export type LoadTradeDisciplineResult =
  | { readonly ok: true; readonly records: ReadonlyMap<TradeId, TradeDisciplineRecord>; readonly damaged: number }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'discipline-read-failed' };

/**
 * The one read of discipline records outside `data/`: the records of the
 * trades asked for. Damaged records are left out and counted, never thrown
 * (D8). It does not filter by source; callers pass ids from their own scoped query.
 */
export async function loadTradeDiscipline(db: KairosDatabase, tradeIds: readonly TradeId[]): Promise<LoadTradeDisciplineResult> {
  const ids = [...new Set(tradeIds)];
  if (ids.length === 0) return { ok: true, records: new Map(), damaged: 0 };
  try {
    const stored = await createKairosRepositories(db).tradeDiscipline.listByTradeIds(ids);
    const records = new Map<TradeId, TradeDisciplineRecord>();
    let damaged = 0;
    for (const record of stored) {
      if (isTradeDisciplineRecordShape(record)) records.set(record.tradeId, record);
      else damaged += 1;
    }
    return { ok: true, records, damaged };
  } catch {
    return { ok: false, type: 'storage-error', reason: 'discipline-read-failed' };
  }
}

export interface TradeDisciplineCardsData {
  readonly lists: DisciplineLists;
  /** The saved record of each trade that has one, by trade id. */
  readonly records: ReadonlyMap<string, TradeDisciplineRecord>;
  /** The trader's current strategies (P28). */
  readonly strategies: readonly Strategy[];
}

/**
 * Everything the trade cards on one page need: the current lists, the
 * strategies and the saved records of those trades, in three reads for the whole page. A failed
 * record read throws, so the host shows its "could not load" state.
 */
export async function loadTradeDisciplineCards(db: KairosDatabase, tradeIds: readonly string[]): Promise<TradeDisciplineCardsData> {
  const repositories = createKairosRepositories(db);
  const lists = await readDisciplineLists(repositories.metadata);
  const strategies = await readStrategies(repositories.metadata);
  if (tradeIds.length === 0) return Object.freeze({ lists, records: new Map(), strategies });
  const loaded = await loadTradeDiscipline(db, tradeIds as readonly TradeId[]);
  if (!loaded.ok) throw new Error(loaded.reason);
  return Object.freeze({ lists, records: loaded.records, strategies });
}
