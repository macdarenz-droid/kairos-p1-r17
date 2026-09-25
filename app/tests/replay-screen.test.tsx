import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { appRoutes } from '../src/app/routes';
import { projectReplayPicture } from '../src/application/practice/replayTrade';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { ThemeProvider } from '../src/design-system/themes';
import { TradePictureCard } from '../src/features/journal/TradePictureCard';
import { ReplayScreen } from '../src/features/practice/ReplayScreen';
import type { MarketCandleHistoryRequest } from '../src/services/market-data/MarketCandleHistoryPort';
import { fakeReplayMarket, HOUR, replayCandle } from './fixtures/replayCandles';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-replay-screen-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const NOW = Date.parse('2024-04-01T00:00:00.000Z');
const START = '2024-03-01T12:00';
const alignedStart = Math.floor(new Date(START).getTime() / HOUR) * HOUR;
type Fake = ReturnType<typeof fakeReplayMarket>;

async function mount(fake: Fake = fakeReplayMarket({ nowMs: NOW })) {
  const db = await database();
  render(<MemoryRouter><ReplayScreen db={db} market={fake.market} playStepMs={25} /></MemoryRouter>);
  return fake;
}
const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
async function startReplay(start = START) {
  type(/^Start from/, start);
  fireEvent.click(screen.getByRole('button', { name: 'Start replay' }));
}
const stage = () => screen.findByRole('region', { name: 'BTCUSDT · 1 hour candles' });
const now = () => document.querySelector('.kairos-replay__now')!;

beforeAll(async () => { await import('../src/features/practice/ReplayScreen'); }, 30_000);

describe('T-038d the replay route', () => {
  it('opens from its own path and asks the network for nothing', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const router = createMemoryRouter(appRoutes, { initialEntries: ['/practice/replay'] });
      render(<ThemeProvider><RouterProvider router={router} /></ThemeProvider>);
      expect(await screen.findByRole('heading', { name: 'Replay the past' }, { timeout: 5000 })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to Practice' }).getAttribute('href')).toBe('/practice');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('is linked from the Practice page', async () => {
    const db = await database();
    render(<MemoryRouter><PracticeRoute db={db} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Replay the past, one candle at a time' }).getAttribute('href')).toBe('/practice/replay');
  });
});

describe('T-038d playing a replay', () => {
  it('shows the candles up to the moment and the price now', async () => {
    const fake = await mount();
    await startReplay();
    const region = await stage();
    expect(within(region).getByRole('heading', { level: 2 })).toHaveFocus();
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/^BTCUSDT: 60 candles up to .+\. Price now 100 USDT\.$/);
    expect(region.querySelectorAll('.kairos-trade-picture__candle')).toHaveLength(60);
    expect(region.querySelector('.kairos-replay__now strong')!.textContent).toBe('100 USDT');
    expect(screen.getByText('240 candles left')).toBeInTheDocument();
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]).toMatchObject({ interval: '1h', limit: 300 });
  });

  it('shows the future one candle at a time', async () => {
    await mount();
    await startReplay();
    const region = await stage();
    fireEvent.click(screen.getByRole('button', { name: 'Next candle' }));
    expect(region.querySelector('.kairos-replay__now strong')!.textContent).toBe('101 USDT');
    expect(screen.getByText('239 candles left')).toBeInTheDocument();
    expect(now().getAttribute('aria-live')).toBe('polite');
    expect(now().textContent).toContain('Price: 101 USDT');
    expect(region.querySelectorAll('.kairos-trade-picture__candle')).toHaveLength(60);
    expect(screen.getByRole('img').getAttribute('aria-label')!.startsWith('BTCUSDT: 60 candles')).toBe(true);
  });

  it('plays and pauses', async () => {
    await mount();
    await startReplay();
    await stage();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next candle' })).toBeDisabled();
    expect(now().getAttribute('aria-live')).toBe('off');
    const left = () => Number(screen.getByText(/candles? left$/).textContent!.split(' ')[0]);
    await waitFor(() => expect(left()).toBeLessThan(239));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const paused = left();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(left()).toBe(paused);
  });

  it('stops by itself at the last candle', async () => {
    await mount(fakeReplayMarket({ nowMs: alignedStart + 3 * HOUR + 1 }));
    await startReplay();
    await stage();
    expect(screen.getByText('3 candles left')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(await screen.findByText('No candles left')).toBeInTheDocument();
    expect(screen.getByText('This replay has no candles left. Choose another moment to keep practising.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next candle' })).toBeDisabled();
  });

  it('goes back to the form with the choices kept', async () => {
    await mount();
    await startReplay();
    await stage();
    fireEvent.click(screen.getByRole('button', { name: 'Choose another moment' }));
    const market = await screen.findByLabelText(/^Market/);
    expect(market).toHaveValue('BTCUSDT');
    expect(screen.getByLabelText(/^Start from/)).toHaveValue(START);
    await waitFor(() => expect(market).toHaveFocus());
  });
});

describe('T-038d refusals and offline', () => {
  const candlesFrom = (fromMs: number, count: number) => Array.from({ length: count }, (_, i) => replayCandle(fromMs + i * HOUR, '100', '101', '99', '100'));

  it.each([
    ['an empty start', {}, '', /^Start from/, 'Choose the date and time to start from.'],
    ['an unknown market', { market: 'NOPEUSDT' }, START, /^Market/, "Kairos can't find this market on Binance. Check the spelling, for example BTCUSDT."],
    ['a start in the future', {}, '2024-05-01T00:00', /^Start from/, 'Pick a time in the past: a replay only uses candles that have finished.'],
    ['no candles before the start', { history: () => candlesFrom(alignedStart, 10) }, START, /^Start from/, 'Binance has no candles for this market before that moment. Pick a later time.'],
    ['no candles after the start', { history: () => candlesFrom(alignedStart - 10 * HOUR, 10) }, START, /^Start from/, 'There are no finished candles after that moment yet. Pick an earlier time.'],
  ] as const)('explains %s in plain words and focuses its field', async (_label, options, start, field, message) => {
    const { market, ...fakeOptions } = options as { market?: string; history?: (request: MarketCandleHistoryRequest) => ReturnType<typeof candlesFrom> };
    const fake = await mount(fakeReplayMarket({ nowMs: NOW, ...fakeOptions }));
    if (market) type(/^Market/, market);
    await startReplay(start);
    expect(await screen.findByText(message)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(field)).toHaveFocus());
    if (market) expect(fake.requests).toHaveLength(0);
  });

  it('says past prices are unavailable offline, and tries again', async () => {
    const fake = fakeReplayMarket({ nowMs: NOW });
    fake.state.metadataFails = true;
    await mount(fake);
    await startReplay();
    expect(await screen.findByRole('alert')).toHaveTextContent('Past prices are unavailable. Replay needs an internet connection to load them. Your saved trades are not affected.');
    fake.state.metadataFails = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await stage()).toBeInTheDocument();
  });
});

describe('T-038d trade picture label and notes', () => {
  const replay = { symbol: 'BTCUSDT', quoteAsset: 'USDT', candleSize: { interval: '1h', label: '1 hour', ms: HOUR } as const, candles: [replayCandle(0, '1', '2', '1', '2'), replayCandle(HOUR, '2', '3', '2', '3')], startIndex: 1 };

  it('takes its own label, and can hide its notes', () => {
    const model = projectReplayPicture(replay, 1, null)!;
    render(<TradePictureCard model={model} label="X" />);
    expect(screen.getByRole('img', { name: 'X' })).toBeInTheDocument();
    cleanup();
    const empty = { ...model, candles: [] };
    render(<TradePictureCard model={empty} notes={false} />);
    expect(screen.queryByText('Candles need a connection.')).toBeNull();
    cleanup();
    render(<TradePictureCard model={empty} />);
    expect(screen.getByText('Candles need a connection.')).toBeInTheDocument();
    expect(screen.getByText('Add a stop and target to see your risk box.')).toBeInTheDocument();
  });
});
