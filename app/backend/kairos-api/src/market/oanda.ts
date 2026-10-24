/**
 * U10 (D231, D232): reading forex and metal candles from OANDA's REST API with the owner's token (the secret
 * MARKET_DATA_API_KEY). Mid prices, day candles from 00:00 UTC and weeks from Monday, like crypto; no volume (OANDA
 * counts price changes, not traded size). Strict decoders rebuild small JSON from checked values: nothing OANDA sends is
 * passed through.
 */
import type { RouteAnswer } from '../router';
import type { UpstreamResult } from '../upstream';
import { candleCloseMs, compareDecimalText, isDecimalText, isoFromEpochMs, type MarketInterval } from './marketValues';
import type { CandleAsk, MarketCandle } from './binance';

export const OANDA_PRACTICE_HOST = 'api-fxpractice.oanda.com';
export const OANDA_LIVE_HOST = 'api-fxtrade.oanda.com';

/** Which OANDA account the token belongs to (the var KAIROS_FOREX_SOURCE); anything else means no forex source. */
export type ForexSource = 'oanda-practice' | 'oanda-live';

export function forexSource(value: string | undefined): ForexSource | null {
  return value === 'oanda-practice' || value === 'oanda-live' ? value : null;
}

export function oandaHost(source: ForexSource): string {
  return source === 'oanda-live' ? OANDA_LIVE_HOST : OANDA_PRACTICE_HOST;
}

/** The Worker's intervals that OANDA has (checked 2026-10-24): no 1s or 3d, and no months (OANDA's start on the last day of the month before). */
export const OANDA_GRANULARITY: Readonly<Partial<Record<MarketInterval, string>>> = Object.freeze({
  '1m': 'M1', '3m': 'M3', '5m': 'M5', '15m': 'M15', '30m': 'M30',
  '1h': 'H1', '2h': 'H2', '4h': 'H4', '6h': 'H6', '8h': 'H8', '12h': 'H12', '1d': 'D', '1w': 'W',
});

const PAIR = /^[A-Z]{6}$/;

/** Six letters (EURUSD, XAUUSD) as OANDA's instrument (EUR_USD); null otherwise. */
export function oandaInstrument(symbol: string): string | null {
  return PAIR.test(symbol) ? `${symbol.slice(0, 3)}_${symbol.slice(3)}` : null;
}

/**
 * The candles URL for an ask. OANDA refuses `count` with both `from` and `to`, returns the candle that holds `from`, and
 * leaves out the candle that opens exactly at `to`. So a start reads forward one extra candle (the decoder drops what
 * opened before the start and after the end), and an end alone reads back to one second after it. OANDA refuses a `from`
 * or `to` in the future (checked 2026-10-24): the caller never asks with a future start, and an end that is not yet past
 * reads the newest candles instead.
 */
export function oandaCandlesUrl(host: string, instrument: string, granularity: string, ask: CandleAsk, nowMs: number): string {
  const params = new URLSearchParams({ price: 'M', granularity, dailyAlignment: '0', alignmentTimezone: 'UTC', weeklyAlignment: 'Monday' });
  if (ask.startMs !== null) {
    params.set('from', String(Math.floor(ask.startMs / 1_000)));
    params.set('count', String(ask.limit + 1));
  } else if (ask.endMs !== null && Math.floor(ask.endMs / 1_000) + 1 < Math.floor(nowMs / 1_000)) {
    params.set('to', String(Math.floor(ask.endMs / 1_000) + 1));
    params.set('count', String(ask.limit));
  } else {
    params.set('count', String(ask.limit));
  }
  return `https://${host}/v3/instruments/${instrument}/candles?${params}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}

/** OANDA's RFC 3339 time with up to 9 fraction digits, as epoch ms; null unless whole milliseconds in UTC. */
function oandaTimeMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  if (match === null) return null;
  const fraction = (match[2] ?? '').padEnd(9, '0');
  if (fraction.slice(3) !== '000000') return null;
  const ms = Date.parse(`${match[1]}.${fraction.slice(0, 3)}Z`);
  return Number.isSafeInteger(ms) && isoFromEpochMs(ms) !== null ? ms : null;
}

const WEEK_MS = 7 * 86_400_000;
/** 1970-01-05, the first Monday after the epoch. */
const FIRST_MONDAY_MS = 4 * 86_400_000;

/** Whether a candle opens where this interval's candles open with UTC days and Monday weeks. */
function isAligned(openMs: number, interval: MarketInterval): boolean {
  if (interval === '1w') return (openMs - FIRST_MONDAY_MS) % WEEK_MS === 0;
  return (openMs % (candleCloseMs(0, interval) + 1)) === 0;
}

/** The decoded page: candles inside the ask's window (at most its limit), and whether every one was closed. */
export interface OandaCandles {
  readonly candles: readonly MarketCandle[];
  readonly closed: boolean;
}

/**
 * OANDA's candles as Kairos candles with no volume; null unless the answer names the instrument and granularity asked
 * for, and every candle is in order, aligned and whole. Candles before the start or after the end are left out.
 */
export function decodeOandaCandles(text: string, instrument: string, granularity: string, ask: CandleAsk): OandaCandles | null {
  const body = parseJson(text);
  if (!isRecord(body) || body.instrument !== instrument || body.granularity !== granularity || !Array.isArray(body.candles)) return null;
  const candles: MarketCandle[] = [];
  let closed = true;
  let previousOpenMs = -1;
  for (const row of body.candles as unknown[]) {
    if (!isRecord(row) || typeof row.complete !== 'boolean' || !isRecord(row.mid)) return null;
    const openMs = oandaTimeMs(row.time);
    if (openMs === null || openMs <= previousOpenMs || !isAligned(openMs, ask.interval)) return null;
    previousOpenMs = openMs;
    const { o: open, h: high, l: low, c: close } = row.mid;
    if (!isDecimalText(open, { positive: true }) || !isDecimalText(high, { positive: true }) || !isDecimalText(low, { positive: true })
      || !isDecimalText(close, { positive: true })) return null;
    if (compareDecimalText(high, open) < 0 || compareDecimalText(high, close) < 0 || compareDecimalText(low, open) > 0 || compareDecimalText(low, close) > 0) return null;
    if ((ask.startMs !== null && openMs < ask.startMs) || (ask.endMs !== null && openMs > ask.endMs)) continue;
    if (candles.length === ask.limit) break;
    if (!row.complete) closed = false;
    candles.push(Object.freeze({
      openTime: new Date(openMs).toISOString(), closeTime: new Date(candleCloseMs(openMs, ask.interval)).toISOString(),
      open, high, low, close, volume: null,
    }));
  }
  return Object.freeze({ candles: Object.freeze(candles), closed });
}

const RETRY_AFTER_MAX_SECONDS = 3_600;

/** The server's answer for a failed OANDA answer: no such pair, a refused token, a request to wait, or down. */
export function oandaFailure(result: Extract<UpstreamResult, { ok: false }>): RouteAnswer {
  if (result.failure === 'status' && result.status === 400 && result.errorText !== undefined) {
    const body = parseJson(result.errorText);
    if (isRecord(body) && typeof body.errorMessage === 'string' && body.errorMessage.includes("for 'instrument'")) return { ok: false, reason: 'unknown-market' };
  }
  if (result.failure === 'status' && (result.status === 401 || result.status === 403)) return { ok: false, reason: 'source-refused' };
  if (result.failure === 'status' && result.status === 429) {
    return { ok: false, reason: 'source-busy', retryAfter: result.retryAfterSeconds === undefined ? 60 : Math.min(result.retryAfterSeconds, RETRY_AFTER_MAX_SECONDS) };
  }
  return { ok: false, reason: 'source-unavailable' };
}
