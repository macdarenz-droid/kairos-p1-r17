/**
 * P27: a replay as a trade. One mapping from the replay (market, plan, the engine's outcome) to a trade input feeds both the picture shown while it plays and the practice trade saved when it is finished, so the two never differ. The entries and exits are the replay engine's; every number shown comes from the trade picture owner.
 */

import type { KairosDatabase } from '../../data/database';
import type { TradeExecutionId, TradeFeeId, TradeId, TradePlanId } from '../../domain/trades';
import { prepareManualTrade } from '../trades/saveManualTrade';
import { projectTradePicture, type TradePictureModel } from '../trade-visualizer/tradePicture';
import { savePracticeTrade, type SavePracticeTradeDependencies, type SavePracticeTradeInput, type SavePracticeTradeResult } from './savePracticeTrade';
import { projectReplayView, type ReplayOrder, type ReplayOutcome } from './replayEngine';
import type { LoadedReplay } from './replayCandles';

export type SaveReplayTradeResult = SavePracticeTradeResult | { readonly ok: false; readonly type: 'not-finished' };

function replayTradeInput(replay: LoadedReplay, order: ReplayOrder | null, outcome: ReplayOutcome | null): SavePracticeTradeInput {
  const base = { symbol: replay.symbol, marketType: 'crypto' as const, ...(replay.quoteAsset === null ? {} : { grossPnlCurrency: replay.quoteAsset }) };
  if (order === null) return { ...base, side: 'long', status: 'draft' };
  const plan = { plannedEntryPrice: order.entryPrice, plannedStopPrice: order.stopPrice, plannedTargetPrice: order.targetPrice, plannedQuantity: order.quantity };
  if (outcome === null || outcome.kind === 'waiting') return { ...base, side: order.side, status: 'draft', plan };
  const entry = { type: 'entry' as const, price: outcome.entry.price, quantity: order.quantity, executedAt: outcome.entry.at };
  if (outcome.kind === 'open') return { ...base, side: order.side, status: 'open', openedAt: outcome.entry.at, plan, executions: [entry] };
  const exit = { type: 'exit' as const, price: outcome.exit.price, quantity: order.quantity, executedAt: outcome.exit.at };
  return { ...base, side: order.side, status: 'closed', openedAt: outcome.entry.at, closedAt: outcome.exit.at, plan, executions: [entry, exit] };
}

/** Ids for a picture that is never saved. */
function previewIds() {
  let index = 0;
  return <T extends TradeId | TradePlanId | TradeExecutionId | TradeFeeId>() => `replay-preview-${++index}` as T;
}

/** The trade picture of the replay at `cursor`: the shown candles and, once placed, the planned trade as it stands. */
export function projectReplayPicture(replay: LoadedReplay, cursor: number, order: ReplayOrder | null): TradePictureModel | null {
  const view = projectReplayView(replay.candles, cursor, order);
  if (view === null) return null;
  // The replay's own time, never the wall clock.
  const prepared = prepareManualTrade(replayTradeInput(replay, order, view.outcome), () => view.replayTime, previewIds());
  if ('ok' in prepared) return null;
  return projectTradePicture({
    trade: prepared.trade,
    plans: prepared.plan ? [prepared.plan] : [],
    executions: prepared.executions,
    fees: prepared.fees,
    candles: view.window,
    now: view.replayTime,
  });
}

/** Saves a finished replay trade as a practice trade from replay. The fills are worked out here from the candles, never handed in. */
export async function saveReplayTrade(
  db: KairosDatabase,
  replay: LoadedReplay,
  cursor: number,
  order: ReplayOrder,
  dependencies: SavePracticeTradeDependencies = {},
): Promise<SaveReplayTradeResult> {
  const view = projectReplayView(replay.candles, cursor, order);
  if (view === null || view.outcome === null || view.outcome.kind !== 'closed') return { ok: false, type: 'not-finished' };
  return savePracticeTrade(db, { ...replayTradeInput(replay, order, view.outcome), source: 'replay' }, dependencies);
}
