import { parseDecimalString, type DecimalString } from '../../src/domain/trades';
import { REPLAY_CANDLE_SIZES, REPLAY_HISTORY_CANDLES, type ReplayMarketDeps } from '../../src/application/practice/replayCandles';
import type { MarketCandle, MarketCandleHistoryRequest } from '../../src/services/market-data/MarketCandleHistoryPort';

export const HOUR = 3_600_000;

function dec(value: string): DecimalString {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`fixture decimal ${value}`);
  return parsed.value;
}

/** One finished candle of `ms` length starting at `openMs`, with exact decimal prices. */
export function replayCandle(openMs: number, open: string, high: string, low: string, close: string, ms = HOUR): MarketCandle {
  return Object.freeze({
    openTime: new Date(openMs).toISOString(),
    closeTime: new Date(openMs + ms - 1).toISOString(),
    open: dec(open), high: dec(high), low: dec(low), close: dec(close),
  });
}

export const REPLAY_TEST_VENUE = 'test-venue';

/** Flat at 100 before `rampFromMs`, then one step up per candle. */
export function rampPrices(openMs: number, rampFromMs: number, ms = HOUR): [string, string, string, string] {
  const k = Math.round((openMs - rampFromMs) / ms);
  if (k < 0) return ['100', '101', '99', '100'];
  return [String(100 + k), String(101.5 + k), String(99.5 + k), String(101 + k)];
}

/** Fake market ports for replay tests: a known market list and a candle history built from the request. */
export function fakeReplayMarket(options: { nowMs: number; symbols?: readonly string[]; quoteAsset?: string; history?: (request: MarketCandleHistoryRequest) => readonly MarketCandle[] }): {
  market: ReplayMarketDeps;
  requests: MarketCandleHistoryRequest[];
  state: { metadataFails: boolean; historyFails: boolean; metadataCalls: number };
} {
  const requests: MarketCandleHistoryRequest[] = [];
  const state = { metadataFails: false, historyFails: false, metadataCalls: 0 };
  const market: ReplayMarketDeps = {
    venue: REPLAY_TEST_VENUE,
    nowMs: () => options.nowMs,
    metadata: {
      acquireInstrumentMetadata: async () => {
        state.metadataCalls += 1;
        if (state.metadataFails) return { ok: false, reason: 'acquisition-failed' };
        return { ok: true, facts: (options.symbols ?? ['BTCUSDT']).map(symbol => ({ instrument: { venue: REPLAY_TEST_VENUE, symbol }, baseAsset: 'X', quoteAsset: options.quoteAsset ?? 'USDT', tradingEnabled: true })) };
      },
    },
    history: {
      acquireHistory: async request => {
        requests.push(request);
        if (state.historyFails) return { ok: false, reason: 'transport-failed' };
        const candles = options.history ? options.history(request) : defaultHistory(request);
        return { ok: true, snapshot: { source: 'market-reference', timeZone: 'UTC', request, observedAt: new Date(options.nowMs).toISOString(), candles } };
      },
    },
  };
  return { market, requests, state };
}

function defaultHistory(request: MarketCandleHistoryRequest): MarketCandle[] {
  const ms = REPLAY_CANDLE_SIZES.find(size => size.interval === request.interval)!.ms;
  const from = request.startTimeMs!, to = request.endTimeMs!;
  const candles: MarketCandle[] = [];
  for (let openMs = from; candles.length < request.limit && openMs <= to; openMs += ms) {
    candles.push(replayCandle(openMs, ...rampPrices(openMs, from + REPLAY_HISTORY_CANDLES * ms, ms), ms));
  }
  return candles;
}
