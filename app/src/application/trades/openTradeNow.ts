/**
 * U16 (P21.A1, D268): the one owner of "If you closed now": how an open trade would stand if its open part closed at the
 * price now. It adds one exit of what is still open, at the price and at the price's minute, to the trade's saved entries
 * and exits in memory only, and lets the result owners work it out from those rows: the result after fees from
 * `calculateSavedTradeMetrics` (read as every result is, `projectVisualPnlOutcome`) and × what you risked from
 * `projectTradeTimesRisked`. Fees are those saved so far; the closing fee is not known, so none is made up. Only a price in
 * the trade's own currency gives a result; nothing is converted, stored or added to any total (rule 7).
 */
import { calculateSavedTradeMetrics } from '../../domain/calculations/tradeMetrics';
import type { DecimalString, TradeExecutionId, TradeExecutionRecord } from '../../domain/trades';
import type { JournalHistoryEntry } from '../journal/historyQuery';
import type { PriceNowResult } from '../market-reference/priceNow';
import { projectTradeTimesRisked } from '../performance/tradeRisk';
import { projectVisualPnlOutcome, type VisualPnlOutcome } from '../visual-pnl/outcomeProjection';

/**
 * `price-unavailable`: no price now. `no-open-part`: nothing is open (no entry saved, or all of it closed).
 * `different-currency`: the price is not in the trade's currency, or one of them is not known. `no-result`: the owners
 * give no result after fees (a fee in another currency, a futures trade without how much one point is worth).
 */
export type OpenTradeNowReason = 'price-unavailable' | 'no-open-part' | 'different-currency' | 'no-result';

export type OpenTradeNow =
  | Readonly<{
      ok: true;
      /** The result after fees if the open part closed at the price now. */
      amount: DecimalString;
      currency: string;
      outcome: Exclude<VisualPnlOutcome, 'unavailable'>;
      /** That result ÷ the money at risk as traded; null when there is no money at risk (no stop). */
      timesRisked: DecimalString | null;
    }>
  | Readonly<{ ok: false; reason: OpenTradeNowReason }>;

const refused = (reason: OpenTradeNowReason): OpenTradeNow => Object.freeze({ ok: false as const, reason });

/** The open trade at the price now, worked out by the result owners from its saved rows plus one exit in memory. Pure. */
export function projectOpenTradeNow(entry: JournalHistoryEntry, priceNow: PriceNowResult): OpenTradeNow {
  if (!priceNow.ok) return refused('price-unavailable');
  const { trade, metrics } = entry;
  if (metrics === null) return refused('no-result');
  if (metrics.state !== 'unrealized' && metrics.state !== 'partially-realized') return refused('no-open-part');
  const currency = trade.grossPnlCurrency ?? null;
  if (priceNow.quote === null || currency === null || priceNow.quote !== currency) return refused('different-currency');

  const closeNow: TradeExecutionRecord = Object.freeze({
    id: `${trade.id}:price-now` as TradeExecutionId,
    tradeId: trade.id,
    type: 'exit' as const,
    price: priceNow.price,
    quantity: metrics.remainingQuantity,
    executedAt: priceNow.at,
    createdAt: priceNow.at,
  });
  const executions = Object.freeze([...entry.executions, closeNow]);
  const closed = calculateSavedTradeMetrics(trade, executions, entry.fees);
  if (!closed.ok || closed.value.netPnl === null) return refused('no-result');
  const result = projectVisualPnlOutcome(closed.value);
  if (result.outcome === 'unavailable' || result.amount === null) return refused('no-result');
  const times = projectTradeTimesRisked({ trade, plans: entry.plans, executions, metrics: closed.value });
  return Object.freeze({ ok: true as const, amount: result.amount, currency, outcome: result.outcome, timesRisked: times.available ? times.value : null });
}
