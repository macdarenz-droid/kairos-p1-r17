import { isDisciplineListItemId } from '../../domain/discipline/disciplineLists';
import type { MarketType, TradeRecord, TradeSide, TradeStatus } from '../../domain/trades';
import { tradeJournalAt } from '../../domain/trades';
import type { VisualPnlOutcome } from '../visual-pnl/outcomeProjection';
import { projectVisualPnlDayKey } from '../visual-pnl/dayBucket';
import type { JournalHistoryScope } from './historyQuery';

/** Won, lost or even: from the result after fees (the visual P&L outcome owner). */
export type JournalResultFilter = 'won' | 'lost' | 'even';
/** Practice only: by hand or in Replay. */
export type JournalMadeFilter = 'paper' | 'replay';

/**
 * U15 (D262): the Journal's and Practice's search and filters, as the address holds them. Null: not set. Dates are days
 * (YYYY-MM-DD) in the trader's time zone, on the Journal date (D259).
 */
export interface JournalFilters {
  /** A symbol search: every trade whose symbol contains it, "/" and spaces ignored. */
  readonly q: string | null;
  readonly status: TradeStatus | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly market: MarketType | null;
  readonly side: TradeSide | null;
  readonly result: JournalResultFilter | null;
  /** A strategy's id, and a mistake's id, from the trade's checklist and review record. */
  readonly strategy: string | null;
  readonly mistake: string | null;
  readonly source: JournalMadeFilter | null;
}

export const JOURNAL_FILTER_KEYS = Object.freeze(['q', 'status', 'from', 'to', 'market', 'side', 'result', 'strategy', 'mistake', 'source'] as const);
export const NO_JOURNAL_FILTERS: JournalFilters = Object.freeze({ q: null, status: null, from: null, to: null, market: null, side: null, result: null, strategy: null, mistake: null, source: null });

const STATUSES: readonly TradeStatus[] = ['draft', 'open', 'closed', 'cancelled'];
const MARKETS: readonly MarketType[] = ['stock', 'forex', 'crypto', 'futures', 'options', 'other'];
const SIDES: readonly TradeSide[] = ['long', 'short'];
const RESULTS: readonly JournalResultFilter[] = ['won', 'lost', 'even'];
const MADE: readonly JournalMadeFilter[] = ['paper', 'replay'];
/** The longest search kept: longer than any symbol. */
const SEARCH_MAX_LENGTH = 40;

/** The text a symbol search compares: capitals, with "/" and spaces left out ("btc/usdt" finds BTCUSDT). */
export function journalSymbolKey(text: string): string {
  return text.replace(/[\s/]+/g, '').toUpperCase();
}

/** A typed search as the address keeps it: trimmed, at most 40 characters, and none without a letter or digit. */
export function journalSearchAsRead(text: string): string | null {
  const kept = text.trim().slice(0, SEARCH_MAX_LENGTH);
  return journalSymbolKey(kept) === '' ? null : kept;
}

const oneOf = <T extends string>(values: readonly T[], value: string | null): T | null => (value !== null && (values as readonly string[]).includes(value) ? value as T : null);

/** A real calendar day written YYYY-MM-DD, else null. */
function day(value: string | null): string | null {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? value : null;
}

/**
 * The filters an address holds. A value Kairos doesn't know is dropped, never guessed: an unknown status or market, a
 * date that isn't a day, an id that isn't one, a search with no letters, and "How it was made" outside Practice.
 */
export function readJournalFilters(params: URLSearchParams, scope: JournalHistoryScope): JournalFilters {
  const id = (key: 'strategy' | 'mistake') => { const value = params.get(key); return isDisciplineListItemId(value) ? value : null; };
  return Object.freeze({
    q: journalSearchAsRead(params.get('q') ?? ''),
    status: oneOf(STATUSES, params.get('status')),
    from: day(params.get('from')),
    to: day(params.get('to')),
    market: oneOf(MARKETS, params.get('market')),
    side: oneOf(SIDES, params.get('side')),
    result: oneOf(RESULTS, params.get('result')),
    strategy: id('strategy'),
    mistake: id('mistake'),
    source: scope === 'practice' ? oneOf(MADE, params.get('source')) : null,
  });
}

/** The address's search with these filters, in one order; anything else it held (a results period) is kept. */
export function writeJournalFilters(filters: Partial<JournalFilters>, keep: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const next = new URLSearchParams(keep);
  for (const key of JOURNAL_FILTER_KEYS) next.delete(key);
  for (const key of JOURNAL_FILTER_KEYS) {
    const value = filters[key];
    if (value !== null && value !== undefined && value !== '') next.set(key, value);
  }
  return next;
}

export function hasJournalFilters(filters: JournalFilters): boolean {
  return JOURNAL_FILTER_KEYS.some(key => filters[key] !== null);
}

/** A link to the Journal's (or Practice's) list with these filters: the coach's mistake note, a Patterns group (D262). */
export function journalListHref(scope: JournalHistoryScope, filters: Partial<JournalFilters>): string {
  const search = writeJournalFilters(filters).toString();
  return `/${scope === 'practice' ? 'practice' : 'journal'}${search === '' ? '' : `?${search}`}`;
}

/** Whether filters need the trade's result, checklist or review: those are read with the trade, a batch at a time. */
export const needsJournalDetails = (filters: JournalFilters): boolean => filters.result !== null || filters.strategy !== null || filters.mistake !== null;

/** The widest Journal dates a day range can hold in any time zone (UTC−12 to UTC+14), as stored text, to narrow a walk. */
export function journalDateBounds(filters: Pick<JournalFilters, 'from' | 'to'>): Readonly<{ from: string | null; to: string | null }> {
  const at = (value: string, shiftHours: number) => new Date(Date.parse(`${value}T00:00:00.000Z`) + shiftHours * 3_600_000).toISOString();
  return { from: filters.from === null ? null : at(filters.from, -14), to: filters.to === null ? null : at(filters.to, 24 + 12) };
}

/** Whether a trade's own fields match: status, market, side, how it was made, the symbol search and the dates. */
export function matchesJournalTradeFields(trade: TradeRecord, filters: JournalFilters, timeZone: string): boolean {
  if (filters.status !== null && trade.status !== filters.status) return false;
  if (filters.market !== null && trade.marketType !== filters.market) return false;
  if (filters.side !== null && trade.side !== filters.side) return false;
  if (filters.source !== null && trade.source !== filters.source) return false;
  if (filters.q !== null && !journalSymbolKey(trade.symbol).includes(journalSymbolKey(filters.q))) return false;
  if (filters.from !== null || filters.to !== null) {
    const journalDay = projectVisualPnlDayKey(tradeJournalAt(trade), timeZone);
    if (!journalDay.available) return false;
    if (filters.from !== null && journalDay.dayKey < filters.from) return false;
    if (filters.to !== null && journalDay.dayKey > filters.to) return false;
  }
  return true;
}

const RESULT_OF: Readonly<Partial<Record<VisualPnlOutcome, JournalResultFilter>>> = { profit: 'won', loss: 'lost', breakeven: 'even' };

/** Whether a read trade matches the filters on its result, strategy and mistakes (its checklist and review record). */
export function matchesJournalDetails(
  outcome: VisualPnlOutcome,
  record: Readonly<{ strategy?: { readonly strategyId: string }; mistakes: readonly { readonly itemId: string }[] }> | null,
  filters: JournalFilters,
): boolean {
  if (filters.result !== null && RESULT_OF[outcome] !== filters.result) return false;
  if (filters.strategy !== null && record?.strategy?.strategyId !== filters.strategy) return false;
  if (filters.mistake !== null && !(record?.mistakes ?? []).some(mark => mark.itemId === filters.mistake)) return false;
  return true;
}
