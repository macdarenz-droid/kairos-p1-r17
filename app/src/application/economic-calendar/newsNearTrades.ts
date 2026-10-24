/**
 * P34: the one owner of which saved big news is near a trade (D125). Only a closed trade with canonical open and close times, only
 * news marked big by the trader or by Kairos's list, and only news scheduled from NEWS_NEAR_TRADE_MINUTES before the open to NEWS_NEAR_TRADE_MINUTES after
 * the close. Kairos knows only the news the trader saved, so an empty answer never means "no news".
 */
import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import { isEconomicEventRecordShape, type EconomicEventRecord } from '../../domain/economic-calendar/economicEvent';
import { economicEventSize } from '../../domain/economic-calendar/newsImpact';
import type { TradeRecord } from '../../domain/trades';

export const NEWS_NEAR_TRADE_MINUTES = 30;
const MINUTE_MS = 60_000;
const WINDOW_MS = NEWS_NEAR_TRADE_MINUTES * MINUTE_MS;

export type NewsNearTradeRelation = 'before-open' | 'while-open' | 'after-close';
export interface NewsNearTrade {
  readonly event: EconomicEventRecord;
  readonly relation: NewsNearTradeRelation;
  /** Whole minutes from the news to the open ('before-open') or from the close to the news ('after-close'); null while the trade was open. */
  readonly minutes: number | null;
}
export type NewsNearTradeInput = Pick<TradeRecord, 'status' | 'openedAt' | 'closedAt'>;

function instantMs(value: string | null): number | null {
  if (value === null) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value ? ms : null;
}
/** The open and close of a closed trade, when both are canonical and in order; else null. */
function tradeSpan(trade: NewsNearTradeInput): Readonly<{ open: number; close: number }> | null {
  if (trade.status !== 'closed') return null;
  const open = instantMs(trade.openedAt);
  const close = instantMs(trade.closedAt);
  return open !== null && close !== null && open <= close ? { open, close } : null;
}

/** The saved big news near one trade, in time order. Damaged events and news not marked big are left out. */
export function projectNewsNearTrade(trade: NewsNearTradeInput, events: readonly EconomicEventRecord[]): readonly NewsNearTrade[] {
  const span = tradeSpan(trade);
  if (span === null) return Object.freeze([]);
  const near: NewsNearTrade[] = [];
  for (const event of events) {
    if (!isEconomicEventRecordShape(event) || economicEventSize(event).size !== 'high') continue;
    const at = Date.parse(event.startsAt);
    if (at <= span.open && span.open - at <= WINDOW_MS) {
      near.push(
        Object.freeze({
          event,
          relation: 'before-open',
          minutes: Math.floor((span.open - at) / MINUTE_MS),
        }),
      );
    } else if (span.open < at && at < span.close) {
      near.push(Object.freeze({ event, relation: 'while-open', minutes: null }));
    } else if (at >= span.close && at - span.close <= WINDOW_MS) {
      near.push(
        Object.freeze({
          event,
          relation: 'after-close',
          minutes: Math.floor((at - span.close) / MINUTE_MS),
        }),
      );
    }
  }
  near.sort(
    (a, b) =>
      a.event.startsAt.localeCompare(b.event.startsAt) ||
      a.event.title.localeCompare(b.event.title) ||
      a.event.id.localeCompare(b.event.id),
  );
  return Object.freeze(near);
}

/** The instants a read must cover to find the news near these trades; null when none is a closed trade with both times. */
export function newsNearTradesWindow(trades: readonly NewsNearTradeInput[]): Readonly<{ from: string; to: string }> | null {
  let earliest: number | null = null;
  let latest: number | null = null;
  for (const trade of trades) {
    const span = tradeSpan(trade);
    if (span === null) continue;
    if (earliest === null || span.open < earliest) earliest = span.open;
    if (latest === null || span.close > latest) latest = span.close;
  }
  if (earliest === null || latest === null) return null;
  return Object.freeze({
    from: new Date(earliest - WINDOW_MS).toISOString(),
    to: new Date(latest + WINDOW_MS).toISOString(),
  });
}

/** The saved big news near each trade on a page, by trade id: one read of the instants the trades cover; a trade with none has no key. */
export async function loadNewsNearTrades(
  db: KairosDatabase,
  trades: readonly (NewsNearTradeInput & { readonly id: string })[],
): Promise<ReadonlyMap<string, readonly NewsNearTrade[]>> {
  const near = new Map<string, readonly NewsNearTrade[]>();
  const window = newsNearTradesWindow(trades);
  if (window === null) return near;
  const rows = await createKairosRepositories(db).economicEvents.listStartingBetween(window.from, window.to);
  for (const trade of trades) {
    const items = projectNewsNearTrade(trade, rows);
    if (items.length > 0) near.set(trade.id, items);
  }
  return near;
}
