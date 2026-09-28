import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AnalysisHistoryWorkspace, ANALYSIS_HISTORY_REQUEST_TIMEOUT_MS } from '../src/app/AnalysisHistoryWorkspace';
import type { AnalysisLiveCandleCanvasProps } from '../src/app/AnalysisLiveCandleCanvas';
import type { AnalysisSavedTradeOverlayLiveCandleCanvasProps } from '../src/app/AnalysisSavedTradeOverlayLiveCandleCanvas';
import type { JournalHistoryEntry } from '../src/application/journal';
import type { LiveMarketUniverseInstrumentMetadataFact } from '../src/services/market-data/liveMarketUniverseInstrumentMetadataFact';

const instrument = (symbol: string, quoteAsset = 'USDT'): LiveMarketUniverseInstrumentMetadataFact => ({
  instrument: { venue: 'binance-spot', symbol },
  baseAsset: symbol === 'ETHUSDT' ? 'ETH' : 'BTC',
  quoteAsset,
  tradingEnabled: true,
});
const facts = [instrument('BTCUSDT'), instrument('ETHUSDT', 'USDT')];
const savedEntry = Object.freeze({ trade: { id: 'saved-trade-1' } }) as unknown as JournalHistoryEntry;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function ports() {
  return {
    metadata: { acquireInstrumentMetadata: vi.fn(async () => ({ ok: true as const, facts })) },
    history: { acquireHistory: vi.fn() },
  };
}
function liveCanvas() {
  return vi.fn(({ instrument: selected, interval, quoteAsset, revision = 0 }: AnalysisLiveCandleCanvasProps) =>
    <div data-testid="live-candle-canvas">{selected.venue}/{selected.symbol}/{interval}/{quoteAsset}/{revision}</div>);
}
function savedTradeLiveCanvas() {
  return vi.fn(({ entry, instrument: selected, interval, quoteAsset, revision = 0 }: AnalysisSavedTradeOverlayLiveCandleCanvasProps) =>
    <div data-testid="saved-trade-live-candle-canvas">{entry.trade.id}/{selected.venue}/{selected.symbol}/{interval}/{quoteAsset}/{revision}</div>);
}
function pickSymbol(symbol: string) {
  const picker = screen.getByRole('combobox', { name: 'Chart symbol' });
  fireEvent.focus(picker);
  fireEvent.change(picker, { target: { value: symbol } });
  fireEvent.click(screen.getByRole('option', { name: new RegExp(`^${symbol} ·`) }));
}
async function select(symbol = 'ETHUSDT', interval = '5m') {
  await waitFor(() => expect(screen.getByLabelText('Chart symbol')).toBeEnabled());
  pickSymbol(symbol);
  fireEvent.change(screen.getByLabelText('Timeframe'), { target: { value: interval } });
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('requires an explicit exact metadata symbol and timeframe before mounting the released live canvas', async () => {
  const p = ports(), LiveCanvas = liveCanvas();
  render(<AnalysisHistoryWorkspace ports={p} LiveCanvas={LiveCanvas} />);
  await waitFor(() => expect(screen.getByLabelText('Chart symbol')).toBeEnabled());
  expect(LiveCanvas).not.toHaveBeenCalled();
  expect(p.history.acquireHistory).not.toHaveBeenCalled();
  expect(screen.queryByRole('option', { name: /^BTCUSD ·/ })).toBeNull();
  pickSymbol('ETHUSDT');
  expect(LiveCanvas).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Timeframe'), { target: { value: '1M' } });
  expect(await screen.findByTestId('live-candle-canvas')).toHaveTextContent('binance-spot/ETHUSDT/1M/USDT/0');
  expect(LiveCanvas).toHaveBeenLastCalledWith(expect.objectContaining({ instrument: facts[1].instrument, interval: '1M', quoteAsset: 'USDT', revision: 0 }), undefined);
  expect(p.history.acquireHistory).not.toHaveBeenCalled();
});

it('excludes halted, foreign and duplicate instrument identities before live selection', async () => {
  const p = ports();
  p.metadata.acquireInstrumentMetadata.mockResolvedValue({ ok: true, facts: [...facts, instrument('BTCUSDT'), { ...instrument('HALTED'), tradingEnabled: false }, { ...instrument('OTHER'), instrument: { venue: 'other', symbol: 'OTHER' } }] });
  render(<AnalysisHistoryWorkspace ports={p} LiveCanvas={liveCanvas()} />);
  await waitFor(() => expect(screen.getByLabelText('Chart symbol')).toBeEnabled());
  fireEvent.focus(screen.getByRole('combobox', { name: 'Chart symbol' }));
  expect(within(screen.getByRole('listbox', { name: 'Symbols' })).getAllByRole('option').map(option => option.textContent?.split(' · ')[0])).toEqual(['ETHUSDT']);
});

it('replaces the mounted scope from exact caller metadata and never asks history directly', async () => {
  const p = ports(), LiveCanvas = liveCanvas();
  render(<AnalysisHistoryWorkspace ports={p} LiveCanvas={LiveCanvas} />);
  await select();
  expect(await screen.findByTestId('live-candle-canvas')).toHaveTextContent('ETHUSDT/5m/USDT/0');
  pickSymbol('BTCUSDT');
  expect(await screen.findByTestId('live-candle-canvas')).toHaveTextContent('BTCUSDT/5m/USDT/0');
  expect(LiveCanvas).toHaveBeenLastCalledWith(expect.objectContaining({ instrument: facts[0].instrument, interval: '5m', quoteAsset: 'USDT' }), undefined);
  expect(p.history.acquireHistory).not.toHaveBeenCalled();
});

it('mounts the released saved-trade composition only for the exact P12 entry', async () => {
  const p = ports(), LiveCanvas = liveCanvas(), SavedTradeLiveCanvas = savedTradeLiveCanvas();
  render(<AnalysisHistoryWorkspace entry={savedEntry} ports={p} LiveCanvas={LiveCanvas} SavedTradeLiveCanvas={SavedTradeLiveCanvas} />);
  await select();
  expect(await screen.findByTestId('saved-trade-live-candle-canvas')).toHaveTextContent('saved-trade-1/binance-spot/ETHUSDT/5m/USDT/0');
  expect(SavedTradeLiveCanvas).toHaveBeenLastCalledWith(expect.objectContaining({ entry: savedEntry, instrument: facts[1].instrument, interval: '5m', quoteAsset: 'USDT', revision: 0 }), undefined);
  expect(LiveCanvas).not.toHaveBeenCalled();
  expect(p.history.acquireHistory).not.toHaveBeenCalled();
});

it('mounts the released saved-trade overlay composition with exact scope and the refresh revision', async () => {
  const p = ports(), LiveCanvas = liveCanvas(), SavedTradeLiveCanvas = savedTradeLiveCanvas();
  render(<AnalysisHistoryWorkspace entry={savedEntry} ports={p} LiveCanvas={LiveCanvas} SavedTradeLiveCanvas={SavedTradeLiveCanvas} />);
  await select('BTCUSDT', '1h');
  expect(await screen.findByTestId('saved-trade-live-candle-canvas')).toHaveTextContent('saved-trade-1/binance-spot/BTCUSDT/1h/USDT/0');
  fireEvent.focus(window);
  fireEvent(window, new Event('online'));
  expect(screen.getByTestId('saved-trade-live-candle-canvas')).toHaveTextContent('/0');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh candles' }));
  expect(await screen.findByTestId('saved-trade-live-candle-canvas')).toHaveTextContent('saved-trade-1/binance-spot/BTCUSDT/1h/USDT/1');
  expect(SavedTradeLiveCanvas).toHaveBeenLastCalledWith(expect.objectContaining({ entry: savedEntry, instrument: facts[0].instrument, interval: '1h', quoteAsset: 'USDT', revision: 1 }), undefined);
  expect(SavedTradeLiveCanvas.mock.calls.every(([props]) => Object.keys(props).sort().join() === 'entry,instrument,interval,quoteAsset,revision')).toBe(true);
  expect(LiveCanvas).not.toHaveBeenCalled();
  expect(p.history.acquireHistory).not.toHaveBeenCalled();
});

it('waits for a pending saved-trade read instead of starting a replaceable base session', async () => {
  const p = ports(), LiveCanvas = liveCanvas(), SavedTradeLiveCanvas = savedTradeLiveCanvas();
  const ui = render(<AnalysisHistoryWorkspace savedTradePending ports={p} LiveCanvas={LiveCanvas} SavedTradeLiveCanvas={SavedTradeLiveCanvas} />);
  await select();
  expect(screen.getByRole('status')).toHaveTextContent('Preparing the saved trade chart');
  expect(LiveCanvas).not.toHaveBeenCalled();
  expect(SavedTradeLiveCanvas).not.toHaveBeenCalled();
  ui.rerender(<AnalysisHistoryWorkspace entry={savedEntry} ports={p} LiveCanvas={LiveCanvas} SavedTradeLiveCanvas={SavedTradeLiveCanvas} />);
  expect(await screen.findByTestId('saved-trade-live-candle-canvas')).toBeVisible();
  expect(LiveCanvas).not.toHaveBeenCalled();
});

it('uses only the explicit refresh button as the live-session revision key', async () => {
  const p = ports(), LiveCanvas = liveCanvas();
  render(<AnalysisHistoryWorkspace ports={p} LiveCanvas={LiveCanvas} />);
  await select();
  expect(await screen.findByTestId('live-candle-canvas')).toHaveTextContent('/0');
  fireEvent.focus(window);
  fireEvent(window, new Event('online'));
  expect(screen.getByTestId('live-candle-canvas')).toHaveTextContent('/0');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh candles' }));
  expect(await screen.findByTestId('live-candle-canvas')).toHaveTextContent('/1');
  expect(p.history.acquireHistory).not.toHaveBeenCalled();
});

it('offers metadata retry while keeping history, transport and journal ownership outside the workspace', async () => {
  const p = ports(), LiveCanvas = liveCanvas();
  p.metadata.acquireInstrumentMetadata.mockRejectedValueOnce(new Error('offline'));
  render(<AnalysisHistoryWorkspace ports={p} LiveCanvas={LiveCanvas} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable · Markets');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await select();
  expect(await screen.findByTestId('live-candle-canvas')).toHaveTextContent('ETHUSDT/5m/USDT/0');
  expect(p.metadata.acquireInstrumentMetadata).toHaveBeenCalledTimes(2);
  expect(p.history.acquireHistory).not.toHaveBeenCalled();
});

it('aborts metadata on timeout and unmount without mounting a stale live scope', async () => {
  vi.useFakeTimers();
  const pending = deferred<{ ok: true; facts: readonly LiveMarketUniverseInstrumentMetadataFact[] }>();
  const p = {
    metadata: { acquireInstrumentMetadata: vi.fn((_options?: { signal?: AbortSignal }) => pending.promise) },
    history: { acquireHistory: vi.fn() },
  };
  const LiveCanvas = liveCanvas();
  const ui = render(<AnalysisHistoryWorkspace ports={p} LiveCanvas={LiveCanvas} />);
  const requestedSignal = p.metadata.acquireInstrumentMetadata.mock.calls[0][0]?.signal;
  await act(async () => { vi.advanceTimersByTime(ANALYSIS_HISTORY_REQUEST_TIMEOUT_MS); });
  expect(requestedSignal?.aborted).toBe(true);
  expect(screen.getByRole('alert')).toHaveTextContent('Unavailable · Markets');
  ui.unmount();
  await act(async () => pending.resolve({ ok: true, facts }));
  expect(LiveCanvas).not.toHaveBeenCalled();
});

it('says why the market list failed, and "Try again" reloads it', async () => {
  const p = ports(), LiveCanvas = liveCanvas();
  p.metadata.acquireInstrumentMetadata.mockResolvedValueOnce({ ok: false, reason: 'unavailable', why: 'busy', retryAfterSeconds: 30 } as never);
  render(<AnalysisHistoryWorkspace ports={p} LiveCanvas={LiveCanvas} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable · Markets: too many requests right now.');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await select();
  expect(await screen.findByTestId('live-candle-canvas')).toHaveTextContent('ETHUSDT/5m');
  expect(p.metadata.acquireInstrumentMetadata).toHaveBeenCalledTimes(2);
});

it('opens a trade typed as BTC/USD on BTCUSDT and says how it matched', async () => {
  const start = new Date(Date.now() - 2 * 86_400_000).toISOString(), end = new Date(Date.now() - 2 * 86_400_000 + 3_600_000).toISOString();
  const entry = {
    trade: { id: 'trade-btc-usd', symbol: 'BTC/USD', marketType: 'crypto', status: 'closed', openedAt: start, closedAt: end, createdAt: start },
    executions: [{ type: 'entry', executedAt: start }, { type: 'exit', executedAt: end }],
  } as unknown as JournalHistoryEntry;
  const SavedTradeLiveCanvas = savedTradeLiveCanvas();
  render(<AnalysisHistoryWorkspace entry={entry} ports={ports()} LiveCanvas={liveCanvas()} SavedTradeLiveCanvas={SavedTradeLiveCanvas} />);
  expect(await screen.findByTestId('saved-trade-live-candle-canvas')).toHaveTextContent('trade-btc-usd/binance-spot/BTCUSDT/');
  expect(screen.getByText(/^Matched BTC\/USD to BTC\/USDT on Binance\./)).toBeInTheDocument();
});

function closedTrade(id: string, symbol: string, marketType: string) {
  const start = new Date(Date.now() - 2 * 86_400_000).toISOString(), end = new Date(Date.now() - 2 * 86_400_000 + 3_600_000).toISOString();
  return {
    trade: { id, symbol, marketType, status: 'closed', openedAt: start, closedAt: end, createdAt: start },
    executions: [{ type: 'entry', executedAt: start }, { type: 'exit', executedAt: end }],
  } as unknown as JournalHistoryEntry;
}

it('T-048g fix r1: a futures trade BTCUSDT.P opens BTCUSDT on Binance Spot, and nothing says "Futures candles"', async () => {
  const SavedTradeLiveCanvas = savedTradeLiveCanvas();
  render(<AnalysisHistoryWorkspace entry={closedTrade('trade-perp', 'BTCUSDT.P', 'crypto')} ports={ports()} LiveCanvas={liveCanvas()} SavedTradeLiveCanvas={SavedTradeLiveCanvas} />);
  expect(await screen.findByTestId('saved-trade-live-candle-canvas')).toHaveTextContent('trade-perp/binance-spot/BTCUSDT/');
  expect(screen.getByText(/^Matched BTCUSDT\.P to BTC\/USDT on Binance\./)).toBeInTheDocument();
  expect(document.body.textContent).not.toContain('Futures candles');
});

it('T-048g fix r1: a futures-only market is not called unlisted; a real misspelling still is', async () => {
  const first = render(<AnalysisHistoryWorkspace entry={closedTrade('trade-pepe', '1000PEPEUSDT', 'futures')} ports={ports()} LiveCanvas={liveCanvas()} SavedTradeLiveCanvas={savedTradeLiveCanvas()} />);
  expect(await screen.findByText(/This trade's symbol is not on Binance Spot\./)).toHaveTextContent("This trade's symbol is not on Binance Spot. The market chart shows Binance Spot markets only; the trade's picture shows its futures candles.");
  expect(document.body.textContent).not.toContain("doesn't list");
  expect(document.body.textContent).not.toContain('Check the spelling');
  first.unmount();
  render(<AnalysisHistoryWorkspace entry={closedTrade('trade-doge', 'DOGE/EUR', 'crypto')} ports={ports()} LiveCanvas={liveCanvas()} SavedTradeLiveCanvas={savedTradeLiveCanvas()} />);
  expect(await screen.findByText(/This trade's symbol is not on Binance Spot\./)).toHaveTextContent("Binance doesn't list DOGE/EUR.");
});

it('T-048g fix r1: a market list that fails while offline says so, and coming back online asks once more', async () => {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
  const p = ports();
  p.metadata.acquireInstrumentMetadata.mockRejectedValueOnce(new Error('network'));
  render(<AnalysisHistoryWorkspace ports={p} LiveCanvas={liveCanvas()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent("Unavailable · Markets: you're offline.");
  expect(p.metadata.acquireInstrumentMetadata).toHaveBeenCalledTimes(1);
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
  fireEvent(window, new Event('online'));
  await waitFor(() => expect(p.metadata.acquireInstrumentMetadata).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByLabelText('Chart symbol')).toBeEnabled());
});
