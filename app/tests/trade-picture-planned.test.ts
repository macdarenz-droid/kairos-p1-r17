import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadTradePictureCandles,
  planPlannedTradeCandleWindow,
  planTradePictureCandleWindow,
  projectTradePicture,
  resetTradePictureCandleCache,
  TRADE_PICTURE_INTERVALS,
  type TradePictureInput,
} from '../src/application/trade-visualizer';
import { createTradePictureCandleBrowserDeps } from '../src/app/tradePictureCandleBrowserDeps';
import { parseDecimalString, type DecimalString, type TradeId, type TradePlanId, type TradeRecord } from '../src/domain/trades';
import { resetBinanceSpotExchangeInfoCache } from '../src/services/market-data';
import type { MarketCandle } from '../src/services/market-data/MarketCandleHistoryPort';

const MIN = 60_000, QUARTER = 15 * MIN;
const NOW = '2026-09-24T12:07:30.000Z';
const nowMs = Date.parse(NOW);
const tradeId = 'draft-1' as TradeId;
const originalFetch = globalThis.fetch;

function dec(value: string): DecimalString { const parsed = parseDecimalString(value); if (!parsed.ok) throw new Error(value); return parsed.value; }
function trade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return { id: tradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'draft', source: 'manual', openedAt: null, closedAt: null, createdAt: NOW, updatedAt: NOW, ...overrides };
}
const plans = [{ id: 'p1' as TradePlanId, tradeId, plannedEntryPrice: dec('100'), plannedStopPrice: dec('95'), plannedTargetPrice: dec('110'), plannedQuantity: dec('2'), createdAt: NOW, updatedAt: NOW }];
/** 36 fifteen-minute candles up to and including the one forming now; the first reaches 112, the last closes at 101.5. */
const recent: MarketCandle[] = Array.from({ length: 36 }, (_, index) => {
  const openMs = Math.floor(nowMs / QUARTER) * QUARTER - (35 - index) * QUARTER;
  return { openTime: new Date(openMs).toISOString(), closeTime: new Date(openMs + QUARTER - 1).toISOString(), open: dec('100'), high: dec(index === 0 ? '112' : '103'), low: dec('97'), close: dec(index === 35 ? '101.5' : '100.5') };
});
const draftInput = (overrides: Partial<TradePictureInput> = {}): TradePictureInput => ({ trade: trade(), plans, executions: [], fees: [], candles: recent, now: NOW, candleInterval: '15m', ...overrides });
const row = (model: ReturnType<typeof projectTradePicture>, key: string) => model.info.find(item => item.key === key);

let klineUrls: URL[] = [];
function stubFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/exchangeInfo')) return { text: async () => JSON.stringify({ symbols: [{ symbol: 'BTCUSDT', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDT' }] }) };
    if (url.pathname.endsWith('/klines')) {
      klineUrls.push(url);
      const from = Number(url.searchParams.get('startTime'));
      const ms = TRADE_PICTURE_INTERVALS.find(item => item.interval === url.searchParams.get('interval'))!.ms;
      const kline = (openMs: number) => [openMs, '100', '105', '95', '102', '10', openMs + ms - 1, '1000', 10, '5', '500', '0'];
      return { status: 200, text: async () => JSON.stringify([kline(from), kline(from + ms)]), headers: { get: () => null } };
    }
    throw new Error(`unexpected ${url}`);
  }) as unknown as typeof fetch;
}
const deps = () => ({ ...createTradePictureCandleBrowserDeps(), nowMs: () => nowMs });

beforeEach(() => { resetTradePictureCandleCache(); resetBinanceSpotExchangeInfoCache(); klineUrls = []; });
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

describe('T-052a a planned trade drawn from now', () => {
  it('asks the 36 fifteen-minute candles up to now, and asks again each time (D212)', async () => {
    stubFetch();
    const first = await loadTradePictureCandles(trade(), [], deps());
    expect(first).toMatchObject({ ok: true, interval: '15m' });
    const asked = klineUrls[0]!;
    expect(asked.searchParams.get('interval')).toBe('15m');
    expect(Number(asked.searchParams.get('endTime'))).toBe(nowMs);
    expect(Number(asked.searchParams.get('startTime'))).toBe(Math.floor(nowMs / QUARTER) * QUARTER - 35 * QUARTER);
    expect(planPlannedTradeCandleWindow(nowMs)).toMatchObject({ interval: '15m', endTimeMs: nowMs, limit: 37 });
    await loadTradePictureCandles(trade(), [], deps());
    expect(klineUrls).toHaveLength(2);
  });

  it('keeps a closed trade\'s candles in memory, as before', async () => {
    stubFetch();
    const closed = trade({ status: 'closed', openedAt: '2026-09-20T09:00:00.000Z', closedAt: '2026-09-20T10:00:00.000Z' });
    const first = await loadTradePictureCandles(closed, [], deps());
    const window = planTradePictureCandleWindow(Date.parse(closed.openedAt!), Date.parse(closed.closedAt!))!;
    expect(first).toMatchObject({ ok: true, interval: window.interval });
    await loadTradePictureCandles(closed, [], deps());
    expect(klineUrls).toHaveLength(1);
  });

  it('draws the boxes from now with room for 12 candles, and shows the price now', () => {
    const model = projectTradePicture(draftInput());
    const end = new Date(nowMs + 12 * QUARTER).toISOString();
    expect(model.riskBox).toMatchObject({ startAt: NOW, endAt: end, top: '100', bottom: '95' });
    expect(model.rewardBox).toMatchObject({ startAt: NOW, endAt: end, top: '110', bottom: '100' });
    expect(model.timeRange?.to).toBe(end);
    expect(model.priceNow).toEqual({ price: '101.5', at: recent[35]!.openTime });
    expect(row(model, 'price-now')).toMatchObject({ label: 'Price now', value: '101.5', text: '101.5' });
    expect(model.missing.map(item => item.part)).not.toContain('start-time');
    expect(model.planNote).toBeNull();
    expect(model.candleWords).toBe('15-minute candles');
    // The recent market counts in the price range, even 9 hours back: 95 (the stop) to 112 (the first candle), padded by 8%.
    expect(model.priceRange).toEqual({ low: '93.64', high: '113.36' });
  });

  it('shows the money at risk as planned, with the currency when there is one', () => {
    expect(row(projectTradePicture(draftInput()), 'money-at-risk')).toMatchObject({ value: '10', text: '10, as planned' });
    const usdt = projectTradePicture(draftInput({ trade: trade({ grossPnlCurrency: 'USDT' }) }));
    expect(row(usdt, 'money-at-risk')).toMatchObject({ value: '10', unit: 'USDT', text: '10 USDT, as planned' });
    expect(row(usdt, 'price-now')?.text).toBe('101.5 USDT');
  });

  it('has no price now without candles, and no "Price now" row for a trade that is not planned', () => {
    const offline = projectTradePicture(draftInput({ candles: null }));
    expect(offline.priceNow).toBeNull();
    expect(row(offline, 'price-now')).toMatchObject({ value: null, text: null });
    expect(offline.riskBox).toMatchObject({ startAt: NOW });
    expect(offline.candleWords).toBeNull();
    const open = projectTradePicture(draftInput({ trade: trade({ status: 'open', openedAt: '2026-09-24T09:00:00.000Z' }) }));
    expect(open.priceNow).toBeNull();
    expect(row(open, 'price-now')).toBeUndefined();
  });
});

describe('T-052b fix r1 an open trade asks the market up to now', () => {
  it('after a partial exit, its candles run to now and are asked again each time', async () => {
    stubFetch();
    const open = trade({ status: 'open', openedAt: '2026-09-24T08:00:00.000Z' });
    const fills = [
      { id: 'e1' as never, tradeId, type: 'entry' as const, price: dec('100'), quantity: dec('2'), executedAt: '2026-09-24T08:00:00.000Z', createdAt: NOW },
      { id: 'x1' as never, tradeId, type: 'exit' as const, price: dec('105'), quantity: dec('1'), executedAt: '2026-09-24T09:00:00.000Z', createdAt: NOW },
    ];
    await loadTradePictureCandles(open, fills, deps());
    const window = planTradePictureCandleWindow(Date.parse('2026-09-24T08:00:00.000Z'), nowMs)!;
    expect(Number(klineUrls[0]!.searchParams.get('endTime'))).toBe(window.endTimeMs);
    await loadTradePictureCandles(open, fills, deps());
    expect(klineUrls).toHaveLength(2);
  });
});
