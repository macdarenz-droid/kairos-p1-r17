import { parsePositiveDecimalString, type DecimalString } from '../../../../domain/trades';
import { decimalSubtract } from '../../../../domain/calculations/decimalKernel';
import type { MarketCandle } from '../../MarketCandleHistoryPort';
import { isCandleEpochMs, type BinanceSpotCandleHistoryRequestDescriptor } from './binanceSpotCandleHistoryRequest';

const atLeast = (a: DecimalString, b: DecimalString) => {
  const difference = decimalSubtract(a, b);
  return difference.ok && !difference.value.startsWith('-');
};

function matchesInterval(openMs: number, closeMs: number, interval: string): boolean {
  const durations: Readonly<Record<string, number>> = { '1s':1000, '1m':60000, '3m':180000, '5m':300000, '15m':900000, '30m':1800000, '1h':3600000, '2h':7200000, '4h':14400000, '6h':21600000, '8h':28800000, '12h':43200000, '1d':86400000, '3d':259200000, '1w':604800000 };
  if (interval !== '1M') return closeMs - openMs + 1 === durations[interval];
  const date = new Date(openMs);
  if (date.getUTCDate() !== 1 || date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0 || date.getUTCSeconds() !== 0 || date.getUTCMilliseconds() !== 0) return false;
  date.setUTCMonth(date.getUTCMonth() + 1);
  return closeMs === date.getTime() - 1;
}

/** Decode one response page. Reject the whole page on bad consumed facts;
 * never sort, deduplicate, fill gaps or turn an error into an empty success. */
export function decodeBinanceSpotCandleHistoryResponse(body: string, descriptor: BinanceSpotCandleHistoryRequestDescriptor):
  | { readonly ok: true; readonly candles: readonly MarketCandle[] }
  | { readonly ok: false; readonly reason: 'invalid-json' | 'invalid-page' | 'invalid-candle' | 'invalid-order' | 'outside-window' } {
  let payload: unknown;
  try { payload = JSON.parse(body); } catch { return { ok: false, reason: 'invalid-json' }; }
  if (!Array.isArray(payload) || payload.length > descriptor.scope.limit) return { ok: false, reason: 'invalid-page' };
  const candles: MarketCandle[] = [];
  let previousClose = -1;
  for (const row of payload) {
    if (!Array.isArray(row) || row.length !== 12 || !isCandleEpochMs(row[0]) || !isCandleEpochMs(row[6]) || row[6] < row[0]) return { ok: false, reason: 'invalid-candle' };
    const [openMs, closeMs] = [row[0], row[6]];
    if (!matchesInterval(openMs, closeMs, descriptor.scope.interval)) return { ok: false, reason: 'invalid-candle' };
    if (openMs <= previousClose) return { ok: false, reason: 'invalid-order' };
    const { startTimeMs, endTimeMs } = descriptor.scope;
    if ((startTimeMs !== undefined && openMs < startTimeMs) || (endTimeMs !== undefined && openMs > endTimeMs)) return { ok: false, reason: 'outside-window' };
    const prices = row.slice(1,5).map((value: unknown) => typeof value === 'string' ? parsePositiveDecimalString(value) : null);
    const [open, high, low, close] = prices;
    if (!open?.ok || !high?.ok || !low?.ok || !close?.ok || !atLeast(high.value, open.value) || !atLeast(high.value, close.value) || !atLeast(open.value, low.value) || !atLeast(close.value, low.value)) return { ok: false, reason: 'invalid-candle' };
    candles.push(Object.freeze({ openTime: new Date(openMs).toISOString(), closeTime: new Date(closeMs).toISOString(), open: open.value, high: high.value, low: low.value, close: close.value }));
    previousClose = closeMs;
  }
  return { ok: true, candles: Object.freeze(candles) };
}
