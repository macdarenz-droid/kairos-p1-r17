import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { runKairosAtomicWrite } from '../../data/database/transactions';
import {
  createTradeDomainId,
  validateTradeFields,
  validateTradeRecord,
  type TradeExecutionId,
  type TradeExecutionRecord,
  type TradeFeeId,
  type TradeFeeRecord,
  type TradeId,
  type TradePlanId,
  type TradePlanRecord,
  type TradeRecord,
  type TradeSource,
} from '../../domain/trades';
import { JOURNAL_HISTORY_SOURCES, type JournalHistoryScope } from '../journal/historyQuery';
import { latestTradePlan } from '../trade-visualizer/tradeVisualizerFacts';
import { prepareManualTradeSubmission, type ManualTradeDraft, type PrepareManualTradeSubmissionResult } from './manualTradeDraft';
import { prepareManualTradeExecutionDetails, type ManualExecutionRow, type ManualFeeRow, type PreparedExecutionDetails } from './manualTradeExecutionDraft';
import { keptSavedTime } from './savedTradeDraft';
import { prepareManualTrade, TRADE_FIELD_OF, type SaveManualTradeDependencies, type SaveManualTradeResult } from './saveManualTrade';
import { tradeRevision } from './tradeRevision';

export interface EditSavedTradeInput {
  readonly tradeId: TradeId;
  /** `tradeRevision` of the trade with its entries, exits, fees and plan versions, as the form was filled. */
  readonly expectedRevision: string;
  readonly draft: ManualTradeDraft;
  /** The form's rows; a row whose key is a saved entry's, exit's or fee's id is that saved row, changed or not. */
  readonly executions: readonly ManualExecutionRow[];
  readonly fees: readonly ManualFeeRow[];
  /** D265: the note as typed; blank removes it. */
  readonly note: string;
  /** Which list the trade belongs to: Edit never reaches a trade of the other kind. */
  readonly scope: JournalHistoryScope;
}

/** Why a saved trade can't take the edit: it is gone, it can't be edited here (Replay, or the other list), or another tab changed it first. */
export type EditSavedTradeConflict = Readonly<{ ok: false; type: 'update-conflict'; reason: 'trade-missing' | 'trade-not-editable' | 'trade-changed' }>;

export type EditSavedTradeResult =
  | Readonly<{ ok: true; tradeId: TradeId; planChanged: boolean }>
  | Exclude<PrepareManualTradeSubmissionResult, { ok: true }>
  | Exclude<PreparedExecutionDetails, { ok: true }>
  | Exclude<SaveManualTradeResult, { ok: true }>
  | EditSavedTradeConflict;

/** What a Replay trade's page and edit address say instead of Edit (D263). */
export const REPLAY_TRADE_CANNOT_CHANGE = "Made in Replay from past candles, so its entries and exits can't be changed.";

/** Replay trades come from past candles: their note can change, nothing else (D263). */
export function canEditSavedTrade(source: TradeSource, scope: JournalHistoryScope): boolean {
  return source !== 'replay' && (JOURNAL_HISTORY_SOURCES[scope] as readonly TradeSource[]).includes(source);
}

const PLAN_FIELDS = ['plannedEntryPrice', 'plannedStopPrice', 'plannedTargetPrice', 'plannedQuantity'] as const;

/** Whether two plans say the same: the same four prices and the same "Why I'm taking it". No plan says nothing. */
function samePlan(a: TradePlanRecord | null, b: TradePlanRecord | null): boolean {
  return PLAN_FIELDS.every(field => (a?.[field] ?? null) === (b?.[field] ?? null)) && (a?.reason ?? null) === (b?.reason ?? null);
}

/**
 * U15 (D263): changes every field of a saved trade. It is checked by the same rules as a new trade (the form's
 * preparation, then `prepareManualTrade`). One atomic write replaces the trade's details, entries, exits and fees; it
 * keeps the id, the created time, the source and the checklist, review and strategy record, and each saved row whose
 * key comes back keeps its id. A time the form shows unchanged keeps its exact saved text. A changed plan is a new plan
 * version (the old ones are kept); an unchanged one adds nothing. It refuses a stale form, a Replay trade and a trade
 * of the other list.
 */
export async function editSavedTrade(db: KairosDatabase, input: EditSavedTradeInput, dependencies: SaveManualTradeDependencies = {}): Promise<EditSavedTradeResult> {
  const base = prepareManualTradeSubmission(input.draft);
  if (!base.ok) return base;
  const details = prepareManualTradeExecutionDetails(base.input, input.executions, input.fees);
  if (!details.ok) return details;
  const note = input.note.trim();
  if (note !== '' && !validateTradeFields({ note }).ok) return { ok: false, type: 'validation-error', field: 'note', reason: 'invalid-note' };
  const now = dependencies.now ?? (() => new Date().toISOString());
  const createId = dependencies.createId ?? createTradeDomainId;

  try {
    return await runKairosAtomicWrite(db, ['trades', 'tradePlans', 'tradeExecutions', 'tradeFees'], async ({ repositories: r }): Promise<EditSavedTradeResult> => {
      const saved = await r.trades.get(input.tradeId);
      if (!saved) return { ok: false, type: 'update-conflict', reason: 'trade-missing' };
      if (!canEditSavedTrade(saved.source, input.scope)) return { ok: false, type: 'update-conflict', reason: 'trade-not-editable' };
      const [savedPlans, savedExecutions, savedFees] = await Promise.all([
        r.tradePlans.listByTradeId(saved.id), r.tradeExecutions.listByTradeId(saved.id), r.tradeFees.listByTradeId(saved.id),
      ]);
      if (tradeRevision({ trade: saved, executions: savedExecutions, fees: savedFees, plans: savedPlans }) !== input.expectedRevision) {
        return { ok: false, type: 'update-conflict', reason: 'trade-changed' };
      }

      // Times the form still shows as saved keep their saved text; the rest are as typed.
      const savedExecutionById = new Map(savedExecutions.map(e => [e.id as string, e]));
      const keyedExecution = (index: number): TradeExecutionRecord | undefined => savedExecutionById.get(input.executions[index]?.key ?? '');
      const typed = details.input;
      const prepared = prepareManualTrade({
        ...typed,
        openedAt: keptSavedTime(input.draft.openedAt, saved.openedAt) ?? typed.openedAt,
        closedAt: keptSavedTime(input.draft.closedAt, saved.closedAt) ?? typed.closedAt,
        executions: (typed.executions ?? []).map((row, index) => {
          const kept = keyedExecution(index);
          return kept ? { ...row, executedAt: keptSavedTime(input.executions[index]?.executedAt, kept.executedAt) ?? row.executedAt } : row;
        }),
      }, now, createId);
      if ('ok' in prepared) return prepared;

      const trade: TradeRecord = { ...prepared.trade, id: saved.id, source: saved.source, createdAt: saved.createdAt, ...(note !== '' ? { note } : {}) };
      const checked = validateTradeRecord(trade);
      if (!checked.ok) return { ok: false, type: 'validation-error', field: TRADE_FIELD_OF[checked.reason] ?? 'trade', reason: checked.reason };

      // A saved row keeps its id and created time; a key used twice is the saved row once.
      const used = new Set<string>();
      const executions = prepared.executions.map((execution, index): TradeExecutionRecord => {
        const kept = keyedExecution(index);
        if (kept === undefined || used.has(kept.id)) return { ...execution, tradeId: saved.id };
        used.add(kept.id);
        return { ...execution, id: kept.id as TradeExecutionId, tradeId: saved.id, createdAt: kept.createdAt };
      });
      const keptExecutionIds = new Set(executions.map(e => e.id as string));
      const savedFeeById = new Map(savedFees.map(f => [f.id as string, f]));
      const fees = prepared.fees.map((fee, index): TradeFeeRecord => {
        const kept = savedFeeById.get(input.fees[index]?.key ?? '');
        if (kept === undefined || used.has(kept.id)) return { ...fee, tradeId: saved.id };
        used.add(kept.id);
        // A fee tied to an entry or exit stays tied while that row is kept.
        return { ...fee, id: kept.id as TradeFeeId, tradeId: saved.id, createdAt: kept.createdAt, executionId: kept.executionId !== null && keptExecutionIds.has(kept.executionId) ? kept.executionId : null };
      });

      const latest = latestTradePlan(savedPlans);
      const plan: TradePlanRecord | null = samePlan(prepared.plan, latest) ? null
        : prepared.plan !== null ? { ...prepared.plan, tradeId: saved.id }
        : { id: createId<TradePlanId>(), tradeId: saved.id, plannedEntryPrice: null, plannedStopPrice: null, plannedTargetPrice: null, plannedQuantity: null, createdAt: trade.updatedAt, updatedAt: trade.updatedAt };

      for (const execution of savedExecutions) if (!keptExecutionIds.has(execution.id)) await r.tradeExecutions.delete(execution.id);
      const keptFeeIds = new Set(fees.map(f => f.id as string));
      for (const fee of savedFees) if (!keptFeeIds.has(fee.id)) await r.tradeFees.delete(fee.id);
      await r.trades.put(trade);
      if (plan !== null) await r.tradePlans.put(plan);
      for (const execution of executions) await r.tradeExecutions.put(execution);
      for (const fee of fees) await r.tradeFees.put(fee);
      return { ok: true, tradeId: saved.id, planChanged: plan !== null };
    });
  } catch {
    return { ok: false, type: 'storage-error', reason: 'trade-save-failed' };
  }
}
