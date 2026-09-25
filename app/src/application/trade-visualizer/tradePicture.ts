import {
  calculateRiskPerformance,
  calculateRiskPriceDistance,
  calculateTradeMetrics,
  decimalAbs,
  decimalAdd,
  decimalMultiply,
  decimalSubtract,
  type TradeMetrics,
} from '../../domain/calculations';
import type {
  DecimalString,
  TradeExecutionRecord,
  TradeFeeRecord,
  TradePlanRecord,
  TradeRecord,
  TradeSide,
} from '../../domain/trades';
import type { MarketCandle } from '../../services/market-data/MarketCandleHistoryPort';
import { projectTradeVisualizerFacts } from './tradeVisualizerFacts';
import { projectPlannedRewardToRisk } from '../risk-reward/plannedRewardToRisk';

/** Space above the highest and below the lowest price, as a share of the price span. */
export const TRADE_PICTURE_PRICE_PADDING = '0.08';

export interface TradePictureInput {
  readonly trade: TradeRecord;
  readonly plans: readonly TradePlanRecord[];
  readonly executions: readonly TradeExecutionRecord[];
  readonly fees: readonly TradeFeeRecord[];
  /** Market candles for the trade window, or null when none could be loaded. */
  readonly candles: readonly MarketCandle[] | null;
  /** The current instant (UTC ISO); an open trade's boxes end here. */
  readonly now: string;
}

export interface TradePictureCandle {
  readonly time: string;
  readonly open: DecimalString;
  readonly high: DecimalString;
  readonly low: DecimalString;
  readonly close: DecimalString;
  /** 'above' or 'below' when the whole candle lies outside priceRange (drawn as an edge arrow); null when any part is inside or there is no range. */
  readonly beyond: 'above' | 'below' | null;
}

export interface TradePictureBox {
  /** Planned entry price, where the box starts. */
  readonly entryPrice: DecimalString;
  /** Planned stop (risk box) or target (reward box). */
  readonly edgePrice: DecimalString;
  readonly top: DecimalString;
  readonly bottom: DecimalString;
  readonly startAt: string;
  readonly endAt: string;
}

export interface TradePictureMarker {
  readonly kind: 'entry' | 'exit';
  readonly at: string;
  readonly price: DecimalString;
  readonly quantity: DecimalString;
}

export type TradePictureInfoKey =
  | 'market' | 'direction' | 'date' | 'planned-entry' | 'stop' | 'target' | 'average-exit'
  | 'size' | 'result' | 'planned-reward' | 'actual-r' | 'duration' | 'status';

export interface TradePictureInfoRow {
  readonly key: TradePictureInfoKey;
  /** Plain-word label. */
  readonly label: string;
  /** The exact value from its owner (decimal, ISO time, ms, or word); null when unknown. */
  readonly value: string | null;
  /** Unit of `value` when it has one (currency, "ms"). */
  readonly unit: string | null;
  /** Plain-word sentence for this row, or null when the value is unknown. */
  readonly text: string | null;
}

export type TradePictureMissingPart =
  | 'candles' | 'start-time' | 'planned-entry' | 'stop' | 'target' | 'result' | 'actual-r';

export interface TradePictureMissing {
  readonly part: TradePictureMissingPart;
  readonly message: string;
}

export interface TradePictureModel {
  readonly symbol: string;
  readonly side: TradeSide;
  readonly status: TradeRecord['status'];
  readonly timeRange: Readonly<{ from: string; to: string }> | null;
  /** The trade's candles, the plan's entry, stop and target, and every entry and exit, plus TRADE_PICTURE_PRICE_PADDING; all candles when none of these exist. Candles before or after the trade may go past it: the card cuts them at the edge. */
  readonly priceRange: Readonly<{ low: DecimalString; high: DecimalString }> | null;
  readonly candles: readonly TradePictureCandle[];
  readonly riskBox: TradePictureBox | null;
  readonly rewardBox: TradePictureBox | null;
  readonly markers: readonly TradePictureMarker[];
  readonly info: readonly TradePictureInfoRow[];
  readonly missing: readonly TradePictureMissing[];
}

type Sign = -1 | 0 | 1;
const signOf = (value: DecimalString): Sign => (value === '0' ? 0 : value.startsWith('-') ? -1 : 1);

/** Compares two decimals through the kernel; null when either is not a decimal. */
function compare(left: DecimalString, right: DecimalString): Sign | null {
  const difference = decimalSubtract(left, right);
  return difference.ok ? signOf(difference.value) : null;
}

function extremes(values: readonly DecimalString[]): { low: DecimalString; high: DecimalString } | null {
  let low: DecimalString | null = null, high: DecimalString | null = null;
  for (const value of values) {
    if (low === null || high === null) { if (compare(value, value) === null) continue; low = value; high = value; continue; }
    const belowLow = compare(value, low), aboveHigh = compare(value, high);
    if (belowLow === null || aboveHigh === null) continue;
    if (belowLow < 0) low = value;
    if (aboveHigh > 0) high = value;
  }
  return low === null || high === null ? null : { low, high };
}

function padded(range: { low: DecimalString; high: DecimalString }): { low: DecimalString; high: DecimalString } | null {
  const span = decimalSubtract(range.high, range.low);
  if (!span.ok) return null;
  let base: DecimalString = span.value;
  if (signOf(base) === 0) {
    const magnitude = decimalAbs(range.high);
    if (!magnitude.ok) return null;
    base = signOf(magnitude.value) === 0 ? ('1' as DecimalString) : magnitude.value;
  }
  const padding = decimalMultiply(base, TRADE_PICTURE_PRICE_PADDING);
  if (!padding.ok) return null;
  const low = decimalSubtract(range.low, padding.value), high = decimalAdd(range.high, padding.value);
  return low.ok && high.ok ? { low: low.value, high: high.value } : null;
}

const ms = (iso: string | null | undefined): number | null => {
  if (iso == null) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
};
const iso = (value: number) => new Date(value).toISOString();

function box(entryPrice: DecimalString | null, edgePrice: DecimalString | null, startAt: string | null, endAt: string): TradePictureBox | null {
  if (entryPrice === null || edgePrice === null || startAt === null) return null;
  const order = compare(edgePrice, entryPrice);
  if (order === null) return null;
  return Object.freeze({
    entryPrice, edgePrice,
    top: order > 0 ? edgePrice : entryPrice,
    bottom: order > 0 ? entryPrice : edgePrice,
    startAt, endAt,
  });
}

/** Planned reward ÷ risk from the one owner; null when a level is missing or the plan is not valid. */
function plannedRewardToRisk(side: TradeSide, entry: DecimalString | null, stop: DecimalString | null, target: DecimalString | null): DecimalString | null {
  if (entry === null || stop === null || target === null) return null;
  const planned = projectPlannedRewardToRisk(side, entry, stop, target);
  return planned.ok ? planned.value.ratio : null;
}

/** Actual result in R: result after fees ÷ (|entry − stop| × entered size). */
function actualR(metrics: TradeMetrics | null, entry: DecimalString | null, stop: DecimalString | null): DecimalString | null {
  if (metrics === null || metrics.netPnl === null || entry === null || stop === null || metrics.totalEnteredQuantity === '0') return null;
  const riskPerUnit = calculateRiskPriceDistance(entry, stop);
  if (!riskPerUnit.ok) return null;
  const performance = calculateRiskPerformance(metrics.netPnl, riskPerUnit.value, metrics.totalEnteredQuantity);
  return performance.ok ? performance.realizedR : null;
}

function durationText(durationMs: number): string {
  const minutes = Math.round(durationMs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), restMinutes = minutes % 60;
  if (hours < 48) return restMinutes === 0 ? `${hours} h` : `${hours} h ${restMinutes} min`;
  const days = Math.floor(hours / 24), restHours = hours % 24;
  return restHours === 0 ? `${days} days` : `${days} days ${restHours} h`;
}

const STATUS_WORDS: Readonly<Record<TradeRecord['status'], string>> = { draft: 'Planned', open: 'Open', closed: 'Closed', cancelled: 'Cancelled' };

function row(key: TradePictureInfoKey, label: string, value: string | null, unit: string | null, text: (value: string) => string): TradePictureInfoRow {
  return Object.freeze({ key, label, value, unit, text: value === null ? null : text(value) });
}

/**
 * The trade picture model: candles, risk and reward boxes, fill markers and an
 * info panel, with no DOM. Every number comes from its owner (trade facts,
 * trade metrics, risk and R calculators); nothing is estimated, and unknown
 * parts stay null and are listed in `missing`.
 */
export function projectTradePicture(input: TradePictureInput): TradePictureModel {
  const { trade, plans, executions, fees, candles, now } = input;
  const facts = projectTradeVisualizerFacts(trade, plans, executions);
  const metricsResult = trade.grossPnlCurrency
    ? calculateTradeMetrics(trade.side, executions, undefined, fees, { grossPnlCurrency: trade.grossPnlCurrency })
    : calculateTradeMetrics(trade.side, executions, undefined, fees);
  const metrics = metricsResult.ok ? metricsResult.value : null;
  const plannedQuantity = plans.find(plan => plan.plannedQuantity !== null)?.plannedQuantity ?? null;

  const entryTimes = facts.executedEntries.map(fill => ms(fill.executedAt)).filter((value): value is number => value !== null);
  const exitTimes = facts.executedExits.map(fill => ms(fill.executedAt)).filter((value): value is number => value !== null);
  const startMs = entryTimes.length > 0 ? Math.min(...entryTimes) : ms(trade.openedAt);
  const endMs = exitTimes.length > 0 ? Math.max(...exitTimes) : ms(trade.closedAt) ?? ms(now);
  const startAt = startMs === null ? null : iso(startMs);
  const endAt = iso(endMs ?? Date.parse(now));

  const baseCandles = (candles ?? []).map(candle => ({ time: candle.openTime, open: candle.open, high: candle.high, low: candle.low, close: candle.close }));
  const markers = [
    ...facts.executedEntries.map(fill => Object.freeze({ kind: 'entry' as const, at: fill.executedAt, price: fill.price, quantity: fill.quantity })),
    ...facts.executedExits.map(fill => Object.freeze({ kind: 'exit' as const, at: fill.executedAt, price: fill.price, quantity: fill.quantity })),
  ].sort((a, b) => (ms(a.at) ?? 0) - (ms(b.at) ?? 0));

  const { entry, stop, target } = facts.planned;
  const riskBox = box(entry, stop, startAt, endAt);
  const rewardBox = box(entry, target, startAt, endAt);

  // The range is the trade itself: candles it overlaps, the plan and the fills. Candles before or after it never stretch it.
  const tradeEnd = endMs ?? Date.parse(now);
  const during = startMs === null ? [] : (candles ?? []).filter(candle => {
    const open = ms(candle.openTime), close = ms(candle.closeTime);
    return open !== null && close !== null && open <= tradeEnd && close >= startMs;
  });
  const core: DecimalString[] = [
    ...during.flatMap(candle => [candle.high, candle.low]),
    ...[entry, stop, target].filter((value): value is DecimalString => value !== null),
    ...markers.map(marker => marker.price),
  ];
  const prices = core.length > 0 ? core : baseCandles.flatMap(candle => [candle.high, candle.low]);
  const range = extremes(prices);
  const priceRange = range === null ? null : padded(range);
  const beyondOf = (candle: { high: DecimalString; low: DecimalString }): 'above' | 'below' | null => {
    if (priceRange === null) return null;
    if (compare(candle.low, priceRange.high) === 1) return 'above';
    if (compare(candle.high, priceRange.low) === -1) return 'below';
    return null;
  };
  const pictureCandles = baseCandles.map(candle => Object.freeze({ ...candle, beyond: beyondOf(candle) }));

  const times = [
    ...(startMs === null ? [] : [startMs]), ...(startMs === null ? [] : [endMs ?? Date.parse(now)]),
    ...pictureCandles.map(candle => ms(candle.time)).filter((value): value is number => value !== null),
    ...(candles ?? []).map(candle => ms(candle.closeTime)).filter((value): value is number => value !== null),
    ...markers.map(marker => ms(marker.at)).filter((value): value is number => value !== null),
  ];
  const timeRange = times.length === 0 ? null : Object.freeze({ from: iso(Math.min(...times)), to: iso(Math.max(...times)) });

  const reward = plannedRewardToRisk(trade.side, entry, stop, target);
  const realized = actualR(metrics, entry, stop);
  const durationMs = startMs !== null && endMs !== null && (trade.status === 'closed' || trade.status === 'open') ? Math.max(0, endMs - startMs) : null;
  const size = metrics !== null && metrics.totalEnteredQuantity !== '0' ? metrics.totalEnteredQuantity : plannedQuantity;
  const currency = metrics?.netPnlCurrency ?? null;

  const info: TradePictureInfoRow[] = [
    row('market', 'Market', trade.symbol, null, value => value),
    row('direction', 'Direction', trade.side === 'long' ? 'Long' : 'Short', null, value => value),
    row('date', 'Date', startAt, null, value => value),
    row('planned-entry', 'Planned entry', entry, null, value => value),
    row('stop', 'Stop', stop, null, value => value),
    row('target', 'Target', target, null, value => value),
    row('average-exit', 'Average exit', metrics?.averageExitPrice ?? null, null, value => value),
    row('size', 'Size', size, null, value => value),
    row('result', 'Result after fees', metrics?.netPnl ?? null, currency, value => (currency ? `${value} ${currency}` : value)),
    row('planned-reward', 'Planned reward', reward, null, value => `Reward is ${value}× the risk`),
    row('actual-r', 'Actual result', realized, null, value => `${value.startsWith('-') ? '' : '+'}${value}× what you risked`),
    row('duration', 'How long it lasted', durationMs === null ? null : String(durationMs), 'ms', value => durationText(Number(value))),
    row('status', 'Status', STATUS_WORDS[trade.status], null, value => value),
  ];

  const missing: TradePictureMissing[] = [];
  if (candles === null || candles.length === 0) missing.push({ part: 'candles', message: 'No candles, so only your plan and fills are shown.' });
  if (startAt === null) missing.push({ part: 'start-time', message: 'No start time, so no risk or reward box.' });
  if (entry === null) missing.push({ part: 'planned-entry', message: 'No planned entry, so no risk or reward box.' });
  if (stop === null) missing.push({ part: 'stop', message: 'No stop, so no risk box.' });
  if (target === null) missing.push({ part: 'target', message: 'No target, so no reward box.' });
  if (metrics?.netPnl == null) missing.push({ part: 'result', message: 'No result after fees yet.' });
  if (realized === null) missing.push({ part: 'actual-r', message: 'No result in R: it needs a result, a planned entry and a stop.' });

  return Object.freeze({
    symbol: trade.symbol,
    side: trade.side,
    status: trade.status,
    timeRange,
    priceRange: priceRange === null ? null : Object.freeze(priceRange),
    candles: Object.freeze(pictureCandles),
    riskBox,
    rewardBox,
    markers: Object.freeze(markers),
    info: Object.freeze(info),
    missing: Object.freeze(missing.map(item => Object.freeze(item))),
  });
}
