import { describe, expect, it, vi } from 'vitest';
import type { TradePictureCandlesResult } from '../src/application/trade-visualizer';
import type { TradeExecutionRecord, TradeId, TradeRecord } from '../src/domain/trades';
import { createTradePictureCandleLoader } from '../src/features/journal/tradePictureCandleQueue';

const trade = (id: string, fields: Partial<TradeRecord> = {}): TradeRecord => ({
  id: id as TradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual',
  openedAt: '2026-09-12T04:00:00.000Z', closedAt: '2026-09-12T05:00:00.000Z', createdAt: '2026-09-12T04:00:00.000Z', updatedAt: '2026-09-12T05:00:00.000Z', ...fields,
});
const none: readonly TradeExecutionRecord[] = [];
const candles = { ok: true, candles: [], interval: '1m', source: 'Binance Spot · BTC/USDT', note: null } as unknown as TradePictureCandlesResult;
const failed: TradePictureCandlesResult = { ok: false, why: 'source-down', retryAfterSeconds: null, note: null };

describe('T-060c review r1 the trade pictures\' candle loader', () => {
  it('keeps a closed trade\'s candles while the trade is unchanged, so coming back reads none again', async () => {
    const load = vi.fn(async () => candles);
    const loader = createTradePictureCandleLoader(load);
    expect(await loader(trade('a'), none)).toBe(candles);
    expect(await loader(trade('a'), none)).toBe(candles);
    expect(load).toHaveBeenCalledTimes(1);
    // An edit changes the trade's time: its candles are read again.
    await loader(trade('a', { updatedAt: '2026-09-13T08:00:00.000Z' }), none);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reads a planned or open trade afresh, and never keeps a failed read', async () => {
    const load = vi.fn(async (record: TradeRecord) => (record.id === 'down' ? failed : candles));
    const loader = createTradePictureCandleLoader(load);
    for (let i = 0; i < 2; i += 1) {
      await loader(trade('open', { status: 'open', closedAt: null }), none);
      await loader(trade('down'), none);
    }
    expect(load.mock.calls.map(([record]) => record.id)).toEqual(['open', 'down', 'open', 'down']);
  });

  it('drops a load whose picture went away before its turn, and runs at most three at once', async () => {
    const releases: Array<() => void> = [];
    let running = 0;
    let most = 0;
    const load = vi.fn((record: TradeRecord) => new Promise<TradePictureCandlesResult>(resolve => {
      running += 1; most = Math.max(most, running);
      releases.push(() => { running -= 1; resolve(candles); });
      void record;
    }));
    const loader = createTradePictureCandleLoader(load);
    const gone = new AbortController();
    const asked = ['a', 'b', 'c', 'd', 'e'].map(id => loader(trade(id), none, id === 'd' ? { signal: gone.signal } : {}).catch((error: unknown) => error));
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(3);
    gone.abort();
    while (releases.length > 0) { releases.shift()!(); await new Promise(resolve => setTimeout(resolve, 0)); }
    const results = await Promise.all(asked);
    expect(load.mock.calls.map(([record]) => record.id)).toEqual(['a', 'b', 'c', 'e']);
    expect(most).toBe(3);
    expect(results[3]).toMatchObject({ name: 'AbortError' });
  });
});
