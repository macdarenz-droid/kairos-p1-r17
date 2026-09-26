import { describe, expect, it, vi } from 'vitest';
import {
  createLiveMarketSummaryDeliveryState,
  readLiveMarketSummaryStateSessionScopedSnapshot,
  type LiveMarketSummaryFact,
  type LiveMarketSummaryStateSession,
  type MarketDataInstrument,
} from '../src/services/market-data';

const btc: MarketDataInstrument = { venue: 'binance-spot', symbol: 'BTCUSDT' };
const eth: MarketDataInstrument = { venue: 'binance-spot', symbol: 'ETHUSDT' };
const missing: MarketDataInstrument = { venue: 'binance-spot', symbol: 'SOLUSDT' };
const btcFact = { instrument: btc } as LiveMarketSummaryFact;
const ethFact = { instrument: eth } as LiveMarketSummaryFact;

function populatedState() {
  return {
    factsByInstrument: new Map([
      ['binance-spot::BTCUSDT', btcFact],
      ['binance-spot::ETHUSDT', ethFact],
    ]),
  };
}

describe('P21.22 Live Market Summary State Session Scoped Snapshot Binding Foundation', () => {
  it('reads the released session state exactly once and delegates caller scope unchanged', () => {
    const state = populatedState();
    const getState = vi.fn(() => state);
    const session = { getState } as unknown as LiveMarketSummaryStateSession;
    const scope = [eth, btc, missing] as const;

    const result = readLiveMarketSummaryStateSessionScopedSnapshot(session, scope);

    expect(getState).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(3);
    expect(result[0]?.instrument).toBe(eth);
    expect(result[0]?.fact).toBe(ethFact);
    expect(result[1]?.instrument).toBe(btc);
    expect(result[1]?.fact).toBe(btcFact);
    expect(result[2]?.instrument).toBe(missing);
    expect(result[2]?.fact).toBeNull();
  });

  it('preserves duplicate caller requests as associations and does not infer ranking or dedupe', () => {
    const state = populatedState();
    const session = { getState: () => state } as unknown as LiveMarketSummaryStateSession;
    const result = readLiveMarketSummaryStateSessionScopedSnapshot(session, [btc, eth, btc]);

    expect(result.map((entry) => entry.instrument)).toEqual([btc, eth, btc]);
    expect(result.map((entry) => entry.fact)).toEqual([btcFact, ethFact, btcFact]);
  });

  it('is read-only and does not invoke the released session transition seam', () => {
    const state = createLiveMarketSummaryDeliveryState();
    const transition = vi.fn();
    const session = {
      getState: vi.fn(() => state),
      transition,
    } as unknown as LiveMarketSummaryStateSession;

    const result = readLiveMarketSummaryStateSessionScopedSnapshot(session, [btc]);

    expect(result).toEqual([{ instrument: btc, fact: null }]);
    expect(transition).not.toHaveBeenCalled();
    expect(session.getState).toHaveBeenCalledTimes(1);
    expect(state.factsByInstrument.size).toBe(0);
  });
});
