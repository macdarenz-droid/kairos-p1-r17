import type { TradeExecutionRecord, TradeFeeRecord, TradePlanRecord, TradeRecord } from '../../domain/trades';
import { latestTradePlan } from '../trade-visualizer/tradeVisualizerFacts';
import { createEmptyManualTradeDraft, type ManualTradeDraft, type ManualTradeDraftPlan } from './manualTradeDraft';
import type { ManualExecutionRow, ManualFeeRow } from './manualTradeExecutionDraft';

/** A saved trade with what belongs to it, as the Journal reads it. */
export interface SavedTradeParts {
  readonly trade: TradeRecord;
  readonly plans: readonly TradePlanRecord[];
  readonly executions: readonly TradeExecutionRecord[];
  readonly fees: readonly TradeFeeRecord[];
}

/** U15 (D263): a saved trade as the form shows it for Edit. Each entry, exit and fee row keeps its saved id as its key. */
export interface EditableTradeDraft {
  readonly draft: ManualTradeDraft;
  readonly executions: readonly ManualExecutionRow[];
  readonly fees: readonly ManualFeeRow[];
  readonly note: string;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * A saved time in device time, in the `datetime-local` format the form types: minutes, and seconds only when they are
 * not 0. Empty when there is none. Edit keeps a saved time whose field still shows this text (`keptSavedTime`).
 */
export function localDateTimeInputValue(value: string | null): string {
  if (value === null) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return date.getSeconds() === 0 ? minutes : `${minutes}:${pad(date.getSeconds())}`;
}

/** The saved time when the field still shows it, so an unchanged field keeps its exact saved text (milliseconds too). */
export function keptSavedTime(typed: string | null | undefined, saved: string | null): string | null {
  return saved !== null && (typed ?? '').trim() === localDateTimeInputValue(saved) ? saved : null;
}

function planFields(plan: TradePlanRecord | null): ManualTradeDraftPlan {
  return {
    plannedEntryPrice: plan?.plannedEntryPrice ?? '',
    plannedStopPrice: plan?.plannedStopPrice ?? '',
    plannedTargetPrice: plan?.plannedTargetPrice ?? '',
    plannedQuantity: plan?.plannedQuantity ?? '',
    reason: plan?.reason ?? '',
  };
}

/** The trade's own details as the form types them: what Duplicate copies (D264). */
function detailsOf(trade: TradeRecord, plans: readonly TradePlanRecord[]): ManualTradeDraft {
  return {
    ...createEmptyManualTradeDraft(),
    symbol: trade.symbol,
    marketType: trade.marketType,
    side: trade.side,
    priceCurrency: trade.grossPnlCurrency ?? '',
    exchange: trade.exchange ?? '',
    leverage: trade.leverage ?? '',
    tags: (trade.tags ?? []).join(', '),
    plan: planFields(latestTradePlan(plans)),
  };
}

/** U15 (D263): every saved field, filled in for Edit: times in device time, the newest plan, the note. */
export function editableTradeDraft({ trade, plans, executions, fees }: SavedTradeParts): EditableTradeDraft {
  return {
    draft: {
      ...detailsOf(trade, plans),
      status: trade.status,
      openedAt: localDateTimeInputValue(trade.openedAt),
      closedAt: localDateTimeInputValue(trade.closedAt),
      contractSize: trade.contractSize ?? '',
    },
    executions: executions.map(e => ({ key: e.id, type: e.type, price: e.price, quantity: e.quantity, executedAt: localDateTimeInputValue(e.executedAt) })),
    fees: fees.map(f => ({ key: f.id, amount: f.amount, currency: f.currency })),
    note: trade.note ?? '',
  };
}

/**
 * U15 (D264): Duplicate's copy: the symbol, market, direction, currency, where you traded, leverage, tags and the newest
 * plan. Never its times, entries, exits, fees, note, status or ticks: a new trade happens at its own time.
 */
export function duplicateTradeDraft({ trade, plans }: Pick<SavedTradeParts, 'trade' | 'plans'>): ManualTradeDraft {
  return detailsOf(trade, plans);
}
