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
const STEP: Record<string, number> = { '15m': HOUR / 4, '1h': HOUR, '4h': 4 * HOUR, '1d': 24 * HOUR };
/** Forex trades Sunday 22:00 to Friday 22:00 UTC: no candles in between (weekends are gaps, never made-up candles). */
const weekend = (openMs: number) => { const date = new Date(openMs); const day = date.getUTCDay(), hour = date.getUTCHours(); return day === 6 || (day === 5 && hour >= 22) || (day === 0 && hour < 22); };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The Kairos server's /market/candles for oanda-forex: mid prices at each size, none at weekends, no volume; read forward from a start or back from an end, by count. */
function fakeServer(failure: { reason: string; status: number } | null = null) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname !== '/market/candles') return json({ apiVersion: 1, ok: false, error: 'unavailable', reason: 'source-unavailable', retryAfter: 30 }, 502);
    if (failure !== null) return json({ apiVersion: 1, ok: false, error: 'unavailable', reason: failure.reason, retryAfter: null }, failure.status);
    const symbol = url.searchParams.get('symbol') ?? '';
    const interval = url.searchParams.get('interval') ?? '';
    const ms = STEP[interval];
    const start = url.searchParams.get('start'), end = url.searchParams.get('end'), limit = Number(url.searchParams.get('limit'));
    const [low, step, places] = symbol === 'XAUUSD' ? [2100, 0.5, 2] : [1.08, 0.0001, 4];
    const opens: number[] = [];
    if (start !== null) {
      for (let openMs = Math.ceil(Number(start) / ms) * ms; openMs < NOW && opens.length < limit; openMs += ms) if (!weekend(openMs)) opens.push(openMs);
    } else {
      for (let openMs = Math.floor(Number(end) / ms) * ms; opens.length < limit; openMs -= ms) if (!weekend(openMs)) opens.unshift(openMs);
    }
    const candles = opens.map((openMs, index) => {
      const k = index % 9;
      const price = (n: number) => (low + n * step).toFixed(places);
      return { openTime: new Date(openMs).toISOString(), closeTime: new Date(openMs + ms - 1).toISOString(), open: price(k + 1), high: price(k + 3), low: price(k), close: price(k + 2), volume: null };
    });
    const source = { provider: 'oanda', market: 'forex', symbol: `${symbol.slice(0, 3)}_${symbol.slice(3)}` };
    return json({ apiVersion: 1, ok: true, data: { source, backup: null, interval, fetchedAt: new Date(NOW).toISOString(), candles, next: null } });
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
    // By count: the 60 candles before the moment, read back from it, and the 240 after it, read forward.
    // The forward read ends 480 candles on (room for weekends), so the server can keep the settled page.
    const moment = String(Date.parse('2024-03-05T12:00:00Z'));
    const forwardEnd = String(Number(moment) + 480 * HOUR - 1);
    expect(asked.map(params => [params.get('market'), params.get('symbol'), params.get('interval'), params.get('limit'), params.get('start'), params.get('end')])).toEqual([
      ['oanda-forex', 'EURUSD', '1h', '60', null, String(Number(moment) - 1)], ['oanda-forex', 'EURUSD', '1h', '240', moment, forwardEnd],
      ['oanda-forex', 'XAUUSD', '1h', '60', null, String(Number(moment) - 1)], ['oanda-forex', 'XAUUSD', '1h', '240', moment, forwardEnd],
    ]);
    expect(asked.every(params => !params.has('base') && !params.has('quote'))).toBe(true);
    expect(market.metadataCalls()).toBe(0);
    expect(eur).toMatchObject({ ok: true, replay: { symbol: 'EURUSD', quoteAsset: 'USD', marketType: 'forex', source: 'Candles: OANDA · EUR/USD · mid prices', note: null } });
    expect(gold).toMatchObject({ ok: true, replay: { symbol: 'XAUUSD', quoteAsset: 'USD', marketType: 'forex', source: 'Candles: OANDA · XAU/USD · mid prices' } });
    // Every Replay size: 60 candles before the moment, then the ones after it.
    for (const candleSize of ['15m', '1h', '4h', '1d']) {
      const sized = await loadReplayCandles({ market: 'EURUSD', candleSize, startAt: '2024-03-05T12:00:00Z' }, market);
      expect(sized.ok && sized.replay.startIndex, candleSize).toBe(60);
    }
  });

  it('a six-letter crypto market stays with Binance; only plain currency pairs and metals are forex', () => {
    for (const typed of ['EURUSD', 'EUR/USD', 'usd-jpy', 'XAUUSD', 'XAGEUR', 'USDTRY', 'USD/CNH', 'XAU/XAG']) expect(plainForexPair(typed), typed).not.toBeNull();
    for (const typed of ['ETHBTC', 'BTCEUR', 'BNBETH', 'EURUSX', 'XAUBTC', 'BTCUSDT', 'AAPL', 'USDXAU']) expect(plainForexPair(typed), typed).toBeNull();
  });

  it('weekends have no candles: the replay steps over them, even from a Saturday or a Sunday at 15 minutes', async () => {
    const result = await loadReplayCandles({ market: 'EURUSD', candleSize: '1h', startAt: '2024-03-09T12:00:00Z' }, serverMarket(fakeServer()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { candles, startIndex } = result.replay;
    expect(candles.some(candle => weekend(Date.parse(candle.openTime)))).toBe(false);
    // The last candle before the start is Friday's; the first after it is Sunday evening's.
    expect(startIndex).toBe(60);
    expect(candles[startIndex - 1].openTime).toBe('2024-03-08T21:00:00.000Z');
    expect(candles[startIndex].openTime).toBe('2024-03-10T22:00:00.000Z');
    // Sunday noon at 15 minutes: still Friday's last 60 quarter hours before it.
    const sunday = await loadReplayCandles({ market: 'EURUSD', candleSize: '15m', startAt: '2024-03-10T12:00:00Z' }, serverMarket(fakeServer()));
    expect(sunday).toMatchObject({ ok: true, replay: { startIndex: 60 } });
    if (!sunday.ok) return;
    expect(sunday.replay.candles[59].openTime).toBe('2024-03-08T21:45:00.000Z');
    expect(sunday.replay.candles[60].openTime).toBe('2024-03-10T22:00:00.000Z');
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

  it('focus never falls to the page: "Try again" after "Unavailable", and "Choose another moment" after the last candle', async () => {
    const { unmount } = render(<MemoryRouter><ReplayScreen db={await database()} market={serverMarket(fakeServer({ reason: 'source-unavailable', status: 502 }))} playStepMs={25} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/^Market/), { target: { value: 'EUR/USD' } });
    fireEvent.change(screen.getByLabelText(/^Start from/), { target: { value: '2024-03-05T12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start replay' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus());
    unmount();
    // Two candles after the moment: the second "Next candle" is the last one.
    const start = Date.parse('2024-03-05T12:00:00Z');
    const short: ReplayMarketDeps = {
      ...serverMarket(fakeServer()),
      history: { acquireHistory: async request => ({ ok: true, snapshot: { source: 'market-reference', timeZone: 'UTC', request, observedAt: new Date(NOW).toISOString(),
        candles: request.startTimeMs !== undefined ? [replayCandle(start, '1.08', '1.09', '1.07', '1.085'), replayCandle(start + HOUR, '1.08', '1.09', '1.07', '1.085')]
          : Array.from({ length: 60 }, (_, i) => replayCandle(start - (60 - i) * HOUR, '1.08', '1.09', '1.07', '1.085')) } }) },
    };
    render(<MemoryRouter><ReplayScreen db={await database()} market={short} playStepMs={25} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/^Market/), { target: { value: 'EUR/USD' } });
    fireEvent.change(screen.getByLabelText(/^Start from/), { target: { value: '2024-03-05T12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start replay' }));
    const next = await screen.findByRole('button', { name: 'Next candle' });
    next.focus();
    fireEvent.click(next);
    fireEvent.click(next);
    expect(await screen.findByText('No candles left')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose another moment' })).toHaveFocus();
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

