import { describe, expect, it } from 'vitest';
import {
  createLiveMarketSummaryDeliveryState,
  readLiveMarketSummaryScopedStateSnapshot,
  type LiveMarketSummaryDeliveryState,
  type LiveMarketSummaryFact,
  type MarketDataInstrument,
} from '../src/services/market-data';

const btc: MarketDataInstrument = { venue: 'binance-spot', symbol: 'BTCUSDT' };
const eth: MarketDataInstrument = { venue: 'binance-spot', symbol: 'ETHUSDT' };
const missing: MarketDataInstrument = { venue: 'binance-spot', symbol: 'SOLUSDT' };
const btcFact = { instrument: btc } as LiveMarketSummaryFact;
const ethFact = { instrument: eth } as LiveMarketSummaryFact;

function populatedState(): LiveMarketSummaryDeliveryState {
  return {
    factsByInstrument: new Map([
      ['binance-spot::BTCUSDT', btcFact],
      ['binance-spot::ETHUSDT', ethFact],
    ]),
  };
}

describe('P21.21 Live Market Summary Scoped State Snapshot Foundation', () => {
  it('returns one association for every explicit caller request and preserves exact released fact identity', () => {
    const state = populatedState();
    const result = readLiveMarketSummaryScopedStateSnapshot(state, [eth, btc, missing]);

    expect(result).toHaveLength(3);
    expect(result[0]?.instrument).toBe(eth);
    expect(result[0]?.fact).toBe(ethFact);
    expect(result[1]?.instrument).toBe(btc);
    expect(result[1]?.fact).toBe(btcFact);
    expect(result[2]?.instrument).toBe(missing);
    expect(result[2]?.fact).toBeNull();
  });

  it('preserves duplicate caller requests as duplicate associations without dedupe or ranking policy', () => {
    const state = populatedState();
    const result = readLiveMarketSummaryScopedStateSnapshot(state, [btc, eth, btc]);

    expect(result.map((entry) => entry.instrument)).toEqual([btc, eth, btc]);
    expect(result.map((entry) => entry.fact)).toEqual([btcFact, ethFact, btcFact]);
  });

  it('is a pure read and leaves released state identity/content untouched', () => {
    const state = createLiveMarketSummaryDeliveryState();
    const facts = state.factsByInstrument;
    const result = readLiveMarketSummaryScopedStateSnapshot(state, [btc]);

    expect(result).toEqual([{ instrument: btc, fact: null }]);
    expect(state.factsByInstrument).toBe(facts);
    expect(state.factsByInstrument.size).toBe(0);
  });
});
