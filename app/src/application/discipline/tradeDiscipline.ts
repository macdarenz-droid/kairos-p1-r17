import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories, type KairosRepositories } from '../../data/repositories';
import {
  KAIROS_DISCIPLINE_NOTE_MAX_LENGTH,
  createTradeDisciplineId,
  isTradeDisciplineRecordShape,
  validateTradeDisciplineRecord,
  type DisciplineAnswer,
  type DisciplineItemAnswer,
  type DisciplineListItem,
  type DisciplineListItemId,
  type DisciplineLists,
  type DisciplineMistakeMark,
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

      const lists = await readDisciplineLists(repositories.metadata);
      const existing = await repositories.tradeDiscipline.getByTradeId(input.tradeId);
      const saved = existing !== undefined && isTradeDisciplineRecordShape(existing) ? existing : null;
      // Each label comes from the current list. An id no longer in the list but already saved on this
      // trade keeps its saved words, so re-saving a sheet never drops an answer the trader gave.
      const labelsFrom = (items: readonly DisciplineListItem[], savedMarks: readonly { readonly itemId: string; readonly label: string }[]) => {
        const labels = new Map(savedMarks.map((mark) => [mark.itemId, mark.label]));
        for (const item of items) labels.set(item.id, item.label);
        return labels;
      };
      const answerLabels = input.half === 'checklist'
        ? labelsFrom(lists.checklist, saved?.preTradeChecklist ?? [])
        : labelsFrom(lists.review, saved?.postTradeReview ?? []);
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

      const empty = (id: TradeDisciplineId): TradeDisciplineRecord => ({
        id, tradeId: input.tradeId, preTradeChecklist: [], postTradeReview: [], mistakes: [], note: '',
        checklistCompletedAt: null, reviewedAt: null, createdAt: at, updatedAt: at,
      });
      // A damaged record is replaced by the trader's new answers; an earlier backup still holds it.
      const start = existing === undefined ? empty(createId()) : saved ?? empty((existing as Pick<TradeDisciplineRecord, 'id'>).id);
      const updatedAt = at >= start.createdAt ? at : start.createdAt;
      const record: TradeDisciplineRecord = input.half === 'checklist'
        ? { ...start, preTradeChecklist: answers, checklistCompletedAt: at, updatedAt }
        : { ...start, postTradeReview: answers, mistakes, note, reviewedAt: at, updatedAt };
      const valid = validateTradeDisciplineRecord(record);
      if (!valid.ok) throw new Error(valid.reason);
      await repositories.tradeDiscipline.put(record);
      return { ok: true, record, created: existing === undefined };
    });
  } catch {
    return { ok: false, type: 'storage-error', reason: 'discipline-save-failed' };
  }
}

const emptyRecord = (id: TradeDisciplineId, tradeId: TradeId, at: string): TradeDisciplineRecord => ({
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
  // A damaged record is replaced; an earlier backup still holds it.
  const start = existing === undefined ? emptyRecord(createId(), input.tradeId, at) : saved ?? emptyRecord((existing as Pick<TradeDisciplineRecord, 'id'>).id, input.tradeId, at);
  const updatedAt = at >= start.createdAt ? at : start.createdAt;
  let record: TradeDisciplineRecord;
  if (input.strategyId === null) {
    if (existing === undefined) return { ok: false, type: 'validation-error', reason: 'nothing-to-save' };
    const { strategy: _drop, ...rest } = start;
    record = { ...rest, updatedAt };
  } else {
    let base: TradeStrategyMark;
    if (saved?.strategy?.strategyId === input.strategyId) {
      base = saved.strategy;
    } else {
      const strategy = (await readStrategies(repositories.metadata)).find(item => item.id === input.strategyId);
      if (!strategy) return { ok: false, type: 'not-found', reason: 'strategy-not-found' };
      base = { strategyId: strategy.id, revision: strategy.revision, name: strategy.name, rules: strategy.rules, answers: [], linkedAt: at };
    }
    const written = new Set(base.rules.filter(rule => rule.kind === 'written').map(rule => rule.id));
    if (input.answers.some(answer => !written.has(answer.itemId))) return { ok: false, type: 'validation-error', reason: 'unknown-item' };
    const mark: TradeStrategyMark = { ...base, answers: input.answers.map(({ itemId, answer }) => ({ ruleId: itemId, answer })) };
    record = { ...start, strategy: mark, updatedAt };
  }
  const valid = validateTradeDisciplineRecord(record);
  if (!valid.ok) throw new Error(valid.reason);
  await repositories.tradeDiscipline.put(record);
  return { ok: true, record, created: existing === undefined };
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
}

/**
 * Everything the trade cards on one page need: the current lists and the
 * saved records of those trades, in two reads for the whole page. A failed
 * record read throws, so the host shows its "could not load" state.
 */
export async function loadTradeDisciplineCards(db: KairosDatabase, tradeIds: readonly string[]): Promise<TradeDisciplineCardsData> {
  const lists = await readDisciplineLists(createKairosRepositories(db).metadata);
  if (tradeIds.length === 0) return Object.freeze({ lists, records: new Map() });
  const loaded = await loadTradeDiscipline(db, tradeIds as readonly TradeId[]);
  if (!loaded.ok) throw new Error(loaded.reason);
  return Object.freeze({ lists, records: loaded.records });
}
