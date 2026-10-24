import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseMarketDataPorts } from '../src/app/marketDataPorts';
import { plainForexPair } from '../src/application/markets/forexPair';
import { loadReplayCandles, type LoadedReplay, type ReplayMarketDeps } from '../src/application/practice/replayCandles';
import { placeReplayOrder } from '../src/application/practice/replayEngine';
import { saveReplayTrade } from '../src/application/practice/replayTrade';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import type { TradeExecutionId, TradeFeeId, TradeId, TradePlanId } from '../src/domain/trades';
import { ReplayScreen } from '../src/features/practice/ReplayScreen';
import { createKairosApiClient } from '../src/services/kairos-api/kairosApi';
import { createKairosMarketDataPorts } from '../src/services/kairos-api/marketApi';
import { createBinanceSpotCandleHistoryPort } from '../src/services/market-data/providers/binance/binanceSpotCandleHistoryAcquisition';
import { HOUR, replayCandle } from './fixtures/replayCandles';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-forex-replay-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const NOW = Date.parse('2024-04-01T00:00:00.000Z');
/** Forex trades Sunday 22:00 to Friday 22:00 UTC: no candles in between (weekends are gaps, never made-up candles). */
const weekend = (openMs: number) => { const date = new Date(openMs); const day = date.getUTCDay(), hour = date.getUTCHours(); return day === 6 || (day === 5 && hour >= 22) || (day === 0 && hour < 22); };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The Kairos server's /market/candles for oanda-forex: hourly mid prices, none at weekends, no volume. */
function fakeServer(failure: { reason: string; status: number } | null = null) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname !== '/market/candles') return json({ apiVersion: 1, ok: false, error: 'unavailable', reason: 'source-unavailable', retryAfter: 30 }, 502);
    if (failure !== null) return json({ apiVersion: 1, ok: false, error: 'unavailable', reason: failure.reason, retryAfter: null }, failure.status);
    const symbol = url.searchParams.get('symbol') ?? '';
    const start = Number(url.searchParams.get('start')), end = Number(url.searchParams.get('end')), limit = Number(url.searchParams.get('limit'));
    const [low, step, places] = symbol === 'XAUUSD' ? [2100, 0.5, 2] : [1.08, 0.0001, 4];
    const candles: unknown[] = [];
    for (let openMs = start; openMs <= end && candles.length < limit; openMs += HOUR) {
      if (weekend(openMs)) continue;
      const k = candles.length % 9;
      const price = (n: number) => (low + n * step).toFixed(places);
      candles.push({ openTime: new Date(openMs).toISOString(), closeTime: new Date(openMs + HOUR - 1).toISOString(), open: price(k + 1), high: price(k + 3), low: price(k), close: price(k + 2), volume: null });
    }
    const source = { provider: 'oanda', market: 'forex', symbol: `${symbol.slice(0, 3)}_${symbol.slice(3)}` };
    return json({ apiVersion: 1, ok: true, data: { source, backup: null, interval: url.searchParams.get('interval'), fetchedAt: new Date(NOW).toISOString(), candles, next: null } });
  });
}
function serverMarket(fetchImpl: typeof fetch): ReplayMarketDeps & { readonly metadataCalls: () => number } {
  const ports = createKairosMarketDataPorts(createKairosApiClient({ baseUrl: 'https://api.test', fetchImpl }), { store: null, now: () => NOW, isOnline: () => true });
  let calls = 0;
  return {
    venue: 'binance-spot', history: ports.history, nowMs: () => NOW,
    metadata: { acquireInstrumentMetadata: async options => { calls += 1; return ports.metadata.acquireInstrumentMetadata(options); } },
    metadataCalls: () => calls,
  };
}

describe('T-055d forex and metals in Replay', () => {
  it('EUR/USD and XAUUSD replay from OANDA through the Kairos server, at Replay sizes and its 300 candles, never the market list', async () => {
    const fetchImpl = fakeServer();
    const market = serverMarket(fetchImpl);
    const eur = await loadReplayCandles({ market: 'EUR/USD', candleSize: '1h', startAt: '2024-03-05T12:00:00Z' }, market);
    const gold = await loadReplayCandles({ market: 'xauusd', candleSize: '1h', startAt: '2024-03-05T12:00:00Z' }, market);
    const asked = fetchImpl.mock.calls.map(([input]) => new URL(String(input)).searchParams);
    expect(asked.map(params => [params.get('market'), params.get('symbol'), params.get('interval'), params.get('limit')])).toEqual([['oanda-forex', 'EURUSD', '1h', '300'], ['oanda-forex', 'XAUUSD', '1h', '300']]);
    expect(asked.every(params => !params.has('base') && !params.has('quote'))).toBe(true);
    expect(market.metadataCalls()).toBe(0);
    expect(eur).toMatchObject({ ok: true, replay: { symbol: 'EURUSD', quoteAsset: 'USD', marketType: 'forex', source: 'Candles: OANDA · EUR/USD · mid prices', note: null } });
    expect(gold).toMatchObject({ ok: true, replay: { symbol: 'XAUUSD', quoteAsset: 'USD', marketType: 'forex', source: 'Candles: OANDA · XAU/USD · mid prices' } });
  });

  it('a six-letter crypto market stays with Binance; only plain currency pairs and metals are forex', () => {
    for (const typed of ['EURUSD', 'EUR/USD', 'usd-jpy', 'XAUUSD', 'XAGEUR', 'USDTRY']) expect(plainForexPair(typed), typed).not.toBeNull();
    for (const typed of ['ETHBTC', 'BTCEUR', 'BNBETH', 'EURUSX', 'XAUBTC', 'BTCUSDT', 'AAPL']) expect(plainForexPair(typed), typed).toBeNull();
  });

  it('weekends have no candles: the replay steps over them, even from a Saturday', async () => {
    const result = await loadReplayCandles({ market: 'EURUSD', candleSize: '1h', startAt: '2024-03-09T12:00:00Z' }, serverMarket(fakeServer()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { candles, startIndex } = result.replay;
    expect(candles.some(candle => weekend(Date.parse(candle.openTime)))).toBe(false);
    // The last candle before the start is Friday's; the first after it is Sunday evening's.
    expect(candles[startIndex - 1].openTime).toBe('2024-03-08T21:00:00.000Z');
    expect(candles[startIndex].openTime).toBe('2024-03-10T22:00:00.000Z');
  });

  it('a finished forex replay is saved as a forex practice trade with its quote as the currency', async () => {
    const result = await loadReplayCandles({ market: 'EUR/USD', candleSize: '1h', startAt: '2024-03-05T12:00:00Z' }, serverMarket(fakeServer()));
    if (!result.ok) throw new Error('fixture');
    // Candles of our own: the order's target is hit two candles after it is placed.
    const start = Date.parse('2024-03-05T12:00:00Z');
    const candles = [
      ...Array.from({ length: 60 }, (_, i) => replayCandle(start - (60 - i) * HOUR, '1.0850', '1.0855', '1.0845', '1.0850')),
      replayCandle(start, '1.0850', '1.0870', '1.0849', '1.0865'), replayCandle(start + HOUR, '1.0865', '1.0910', '1.0860', '1.0905'),
    ];
    const replay: LoadedReplay = { ...result.replay, candles, startIndex: 60 };
    const placed = placeReplayOrder(candles, 60, { side: 'long', entryPrice: '1.0850', stopPrice: '1.0800', targetPrice: '1.0900', quantity: '10000' });
    if (!placed.ok) throw new Error(placed.reason);
    const db = await database();
    let index = 0;
    const saved = await saveReplayTrade(db, replay, 62, placed.order, { now: () => '2026-10-24T08:00:00.000Z', createId: <T extends TradeId | TradePlanId | TradeExecutionId | TradeFeeId>() => `fx-${++index}` as T });
    expect(saved).toMatchObject({ ok: true, source: 'replay' });
    if (!saved.ok) return;
    expect(await db.trades.get(saved.tradeId)).toMatchObject({ symbol: 'EURUSD', marketType: 'forex', grossPnlCurrency: 'USD', status: 'closed', source: 'replay' });
  });

  it('without the Kairos server, a forex market says Replay needs it, and asks nothing', async () => {
    const connect = vi.fn();
    const ports = chooseMarketDataPorts({ baseUrl: null, direct: { history: createBinanceSpotCandleHistoryPort(connect, () => new Date(NOW).toISOString()), metadata: { acquireInstrumentMetadata: vi.fn() }, baseline: { acquireBaseline: vi.fn() } } });
    const market: ReplayMarketDeps = { venue: 'binance-spot', history: ports.history, metadata: ports.metadata, nowMs: () => NOW };
    expect(await loadReplayCandles({ market: 'EURUSD', candleSize: '1h', startAt: '2024-03-05T12:00:00Z' }, market)).toEqual({ ok: false, reason: 'needs-server' });
    render(<MemoryRouter><ReplayScreen db={await database()} market={market} playStepMs={25} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/^Market/), { target: { value: 'EUR/USD' } });
    fireEvent.change(screen.getByLabelText(/^Start from/), { target: { value: '2024-03-05T12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start replay' }));
    expect(await screen.findByText('Forex replay needs the Kairos server.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^Market/)).toHaveFocus());
    expect(connect).not.toHaveBeenCalled();
  });

  it('a pair OANDA does not list says so on the market field', async () => {
    render(<MemoryRouter><ReplayScreen db={await database()} market={serverMarket(fakeServer({ reason: 'unknown-market', status: 404 }))} playStepMs={25} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/^Market/), { target: { value: 'ISKJPY' } });
    fireEvent.change(screen.getByLabelText(/^Start from/), { target: { value: '2024-03-05T12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start replay' }));
    expect(await screen.findByText("OANDA doesn't list ISK/JPY. Check the spelling, for example EUR/USD.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^Market/)).toHaveFocus());
  });
});

