import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JournalHistoryEntry } from '../src/application/journal';
import { describeMarketDataUnavailable } from '../src/application/online/onlineWords';
import {
  FOREX_PICTURE_INTERVALS, loadTradePictureCandles, planTradePictureCandleWindow, resetTradePictureCandleCache, type TradePictureCandleDeps,
} from '../src/application/trade-visualizer';
import { chooseMarketDataPorts } from '../src/app/marketDataPorts';
import { parseDecimalString, type DecimalString, type TradeExecutionId, type TradeExecutionRecord, type TradeId, type TradeRecord } from '../src/domain/trades';
import { TradePicture } from '../src/features/journal/TradePicture';
import { TradePictureCandleLoaderContext } from '../src/features/journal/tradePictureCandleQueue';
import { createKairosApiClient } from '../src/services/kairos-api/kairosApi';
import { createKairosMarketDataPorts } from '../src/services/kairos-api/marketApi';
import { createBinanceSpotCandleHistoryPort } from '../src/services/market-data/providers/binance/binanceSpotCandleHistoryAcquisition';

const NOW = Date.parse('2026-10-24T08:00:00.000Z');
const DAY = 86_400_000;
const STEP: Record<string, number> = { '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000, '1h': 3_600_000, '2h': 7_200_000, '4h': 14_400_000, '1d': DAY, '1w': 7 * DAY };
const opened = '2026-10-20T09:00:00.000Z', closed = '2026-10-20T12:00:00.000Z';

function dec(value: string): DecimalString {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`fixture decimal ${value}`);
  return parsed.value;
}
const tradeId = 'trade-fx' as TradeId;
function trade(symbol: string, overrides: Partial<TradeRecord> = {}): TradeRecord {
  return { id: tradeId, symbol, marketType: 'forex', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USD', openedAt: opened, closedAt: closed, createdAt: opened, updatedAt: closed, ...overrides };
}
function fills(entry: string, exit: string, at: { opened: string; closed: string } = { opened, closed }): TradeExecutionRecord[] {
  return [
    { id: 'e1' as TradeExecutionId, tradeId, type: 'entry', price: dec(entry), quantity: dec('10000'), executedAt: at.opened, createdAt: at.opened },
    { id: 'x1' as TradeExecutionId, tradeId, type: 'exit', price: dec(exit), quantity: dec('10000'), executedAt: at.closed, createdAt: at.closed },
  ];
}
const entryOf = (record: TradeRecord, executions: TradeExecutionRecord[]) => ({ trade: record, plans: [], executions, fees: [] }) as unknown as JournalHistoryEntry;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The Kairos server as T-055a answers /market/candles for oanda-forex: mid prices as text, no volume, EUR_USD as OANDA's name. */
function fakeServer(failure: { reason: string; status: number } | null = null) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname !== '/market/candles') return json({ apiVersion: 1, ok: false, error: 'unavailable', reason: 'source-unavailable', retryAfter: 30 }, 502);
    if (failure !== null) return json({ apiVersion: 1, ok: false, error: 'unavailable', reason: failure.reason, retryAfter: null }, failure.status);
    const interval = url.searchParams.get('interval') ?? '';
    const step = STEP[interval];
    const symbol = url.searchParams.get('symbol') ?? '';
    const start = Number(url.searchParams.get('start')), end = Number(url.searchParams.get('end')), limit = Number(url.searchParams.get('limit'));
    const candles: unknown[] = [];
    for (let openMs = Math.ceil(start / step) * step; openMs <= end && candles.length < limit; openMs += step) {
      candles.push({ openTime: new Date(openMs).toISOString(), closeTime: new Date(openMs + step - 1).toISOString(), open: '1.0851', high: '1.0874', low: '1.0842', close: '1.0866', volume: null });
    }
    const source = { provider: 'oanda', market: 'forex', symbol: `${symbol.slice(0, 3)}_${symbol.slice(3)}` };
    return json({ apiVersion: 1, ok: true, data: { source, backup: null, interval, fetchedAt: new Date(NOW).toISOString(), candles, next: null } });
  });
}

function serverDeps(fetchImpl: typeof fetch): TradePictureCandleDeps {
  const ports = createKairosMarketDataPorts(createKairosApiClient({ baseUrl: 'https://api.test', fetchImpl }), { store: null, now: () => NOW, isOnline: () => true });
  return { venue: 'binance-spot', history: ports.history, metadata: ports.metadata, nowMs: () => NOW };
}

function renderPicture(entry: JournalHistoryEntry, deps: TradePictureCandleDeps) {
  return render(<TradePictureCandleLoaderContext.Provider value={(record, executions) => loadTradePictureCandles(record, executions, deps)}>
    <TradePicture entry={entry} variant="full" />
  </TradePictureCandleLoaderContext.Provider>);
}

beforeEach(() => resetTradePictureCandleCache());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('T-055b forex and metal candles on the trade picture', () => {
  it('EURUSD and XAUUSD load OANDA candles through the Kairos server, by their six letters, never the market list', async () => {
    const fetchImpl = fakeServer();
    const deps = serverDeps(fetchImpl);
    const eur = await loadTradePictureCandles(trade('EUR/USD'), fills('1.085', '1.09'), deps);
    const gold = await loadTradePictureCandles(trade('XAUUSD'), fills('2650.5', '2661.2'), deps);
    const asked = fetchImpl.mock.calls.map(([input]) => new URL(String(input)));
    expect(asked.map(url => url.pathname)).toEqual(['/market/candles', '/market/candles']);
    expect(asked.map(url => [url.searchParams.get('market'), url.searchParams.get('symbol')])).toEqual([['oanda-forex', 'EURUSD'], ['oanda-forex', 'XAUUSD']]);
    for (const url of asked) {
      expect(url.searchParams.has('base')).toBe(false);
      expect(url.searchParams.has('quote')).toBe(false);
    }
    expect(eur).toMatchObject({ ok: true, source: 'Candles: OANDA · EUR/USD · mid prices', note: null, interval: '15m' });
    expect(gold).toMatchObject({ ok: true, source: 'Candles: OANDA · XAU/USD · mid prices' });
    if (!eur.ok) return;
    expect(eur.candles.length).toBeGreaterThan(0);
    expect(eur.candles[0]).toEqual({ openTime: '2026-10-20T08:15:00.000Z', closeTime: '2026-10-20T08:29:59.999Z', open: '1.0851', high: '1.0874', low: '1.0842', close: '1.0866' });
    // A missing volume stays missing, never 0 (D232).
    expect(eur.candles.every(candle => !('volume' in candle))).toBe(true);
  });

  it('a long forex trade takes 1-week candles where a crypto trade takes 3-day ones (OANDA has no 3-day size)', async () => {
    const start = Date.parse('2026-06-01T00:00:00.000Z'), end = start + 60 * DAY;
    expect(planTradePictureCandleWindow(start, end)?.interval).toBe('3d');
    expect(planTradePictureCandleWindow(start, end, FOREX_PICTURE_INTERVALS)?.interval).toBe('1w');
    const fetchImpl = fakeServer();
    const long = { opened: new Date(start).toISOString(), closed: new Date(end).toISOString() };
    const result = await loadTradePictureCandles(trade('EURUSD', { openedAt: long.opened, closedAt: long.closed }), fills('1.085', '1.09', long), serverDeps(fetchImpl));
    expect(new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get('interval')).toBe('1w');
    expect(result).toMatchObject({ ok: true, interval: '1w' });
  });

  it('without the Kairos server, the picture says forex candles need it and asks nothing', async () => {
    const connect = vi.fn();
    const acquireInstrumentMetadata = vi.fn();
    const ports = chooseMarketDataPorts({
      baseUrl: null,
      direct: { history: createBinanceSpotCandleHistoryPort(connect, () => new Date(NOW).toISOString()), metadata: { acquireInstrumentMetadata }, baseline: { acquireBaseline: vi.fn() } },
    });
    expect(ports.route).toBe('direct');
    const deps: TradePictureCandleDeps = { venue: 'binance-spot', history: ports.history, metadata: ports.metadata, nowMs: () => NOW };
    const record = trade('EURUSD');
    expect(await loadTradePictureCandles(record, fills('1.085', '1.09'), deps)).toEqual({ ok: false, why: 'no-candle-source', retryAfterSeconds: null, note: 'Forex candles need the Kairos server.' });
    renderPicture(entryOf(record, fills('1.085', '1.09')), deps);
    expect(await screen.findByText('Forex candles need the Kairos server.')).toBeInTheDocument();
    expect(screen.queryByText('Unavailable')).toBeNull();
    expect(connect).not.toHaveBeenCalled();
    expect(acquireInstrumentMetadata).not.toHaveBeenCalled();
  });

  it('a pair OANDA does not list says so in the "Unavailable" box, with no "Try again"', async () => {
    const fetchImpl = fakeServer({ reason: 'unknown-market', status: 404 });
    renderPicture(entryOf(trade('EUR/XYZ'), fills('1.085', '1.09')), serverDeps(fetchImpl));
    expect(await screen.findByText(/^\s*·\s*Candles: OANDA doesn't list EUR\/XYZ\.$/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByText(/Binance/)).toBeNull();
    expect(new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get('symbol')).toBe('EURXYZ');
  });

  it('the picture draws the candles and says where they came from', async () => {
    const { container } = renderPicture(entryOf(trade('EURUSD'), fills('1.085', '1.09')), serverDeps(fakeServer()));
    expect(await screen.findByText('Candles: OANDA · EUR/USD · mid prices')).toBeInTheDocument();
    expect(screen.getByText('15-minute candles')).toBeInTheDocument();
    expect(container.querySelectorAll('.kairos-trade-picture__candle').length).toBeGreaterThan(0);
    expect(screen.queryByText('No candles for this time.')).toBeNull();
  });

  it('the "Unavailable" words name OANDA for forex and keep Binance for crypto', () => {
    const failure = (why: 'unknown-market' | 'region') => ({ ok: false as const, reason: 'unavailable' as const, why, retryAfterSeconds: null });
    const oanda = { provider: 'oanda' as const, pair: 'EUR/USD' };
    expect(describeMarketDataUnavailable(failure('unknown-market'), 'Candles', oanda)).toMatchObject({ message: "Candles: OANDA doesn't list EUR/USD.", retryLabel: null });
    expect(describeMarketDataUnavailable(failure('region'), 'Candles', oanda)).toMatchObject({ message: 'Candles: OANDA refused the Kairos server. Try again later.', retryLabel: 'Try again' });
    expect(describeMarketDataUnavailable(failure('unknown-market'), 'Candles').message).toBe("Candles: Binance doesn't list this market. Check the spelling, for example BTCUSDT.");
    expect(describeMarketDataUnavailable(failure('region'), 'Candles').message).toBe("Candles: Binance isn't available in your region, and the backup source couldn't help. Try again later.");
  });
});
