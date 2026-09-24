import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisHistoryWorkspace } from '../src/app/AnalysisHistoryWorkspace';
import type { AnalysisLiveCandleCanvasProps } from '../src/app/AnalysisLiveCandleCanvas';
import type { AnalysisSavedTradeOverlayLiveCandleCanvasProps } from '../src/app/AnalysisSavedTradeOverlayLiveCandleCanvas';
import { createAnalysisCandleRendererSession } from '../src/app/analysisCandleRendererSession';
import { AnalysisTradeWindowContext } from '../src/app/analysisDrawingToolsContext';
import { tradeReviewVisibleRange } from '../src/features/analysis/tradeReviewInterval';
import { createLightweightChartsV5VisibleRangePort } from '../src/features/chart';
import type { PresentedChartRenderer } from '../src/features/chart/lightweightChartsV5ProductionRenderer';
import type { MarketCandleHistorySnapshot } from '../src/services/market-data/MarketCandleHistoryPort';
import type { DecimalString } from '../src/domain/trades';
import type { JournalHistoryEntry } from '../src/application/journal';
import type { LightweightChartsV5ChartApi } from '../src/features/chart/lightweightChartsV5ModuleAdapter';
import { useContext } from 'react';
import type { LiveMarketUniverseInstrumentMetadataFact } from '../src/services/market-data/liveMarketUniverseInstrumentMetadataFact';

const DAY = 24 * 60 * 60_000;
const fact = (baseAsset: string, quoteAsset = 'USDT'): LiveMarketUniverseInstrumentMetadataFact => ({
  instrument: { venue: 'binance-spot', symbol: `${baseAsset}${quoteAsset}` }, baseAsset, quoteAsset, tradingEnabled: true,
});
const facts = [fact('BTC'), fact('ETH')];
const ports = () => ({ metadata: { acquireInstrumentMetadata: vi.fn(async () => ({ ok: true as const, facts })) } });
const LiveCanvas = (props: AnalysisLiveCandleCanvasProps) => <div data-testid="live-candle-canvas">{props.instrument.symbol}/{props.interval}</div>;
const SavedTradeLiveCanvas = (props: AnalysisSavedTradeOverlayLiveCandleCanvasProps) => <div data-testid="saved-trade-canvas">{props.instrument.symbol}/{props.interval}</div>;

function tradeEntry(symbol: string, daysAgo: number): JournalHistoryEntry {
  const start = new Date(Date.now() - daysAgo * DAY).toISOString();
  const end = new Date(Date.now() - daysAgo * DAY + 3 * 60 * 60_000).toISOString();
  return {
    trade: { id: `trade-${symbol}`, symbol, status: 'closed', openedAt: start, closedAt: end, createdAt: start },
    executions: [{ type: 'entry', executedAt: start }, { type: 'exit', executedAt: end }],
  } as unknown as JournalHistoryEntry;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('T-007 "View trade" pre-selects the chart', () => {
  it('picks the trade symbol (separators removed) and a timeframe that fits the trade', async () => {
    render(<AnalysisHistoryWorkspace entry={tradeEntry('eth/usdt', 2)} ports={ports()} LiveCanvas={LiveCanvas} SavedTradeLiveCanvas={SavedTradeLiveCanvas} />);
    expect(await screen.findByTestId('saved-trade-canvas')).toHaveTextContent('ETHUSDT/15m');
    expect(screen.getByRole('combobox', { name: 'Chart symbol' })).toHaveValue('ETHUSDT');
    expect(screen.getByLabelText('Timeframe')).toHaveValue('15m');
  });

  it('never overrides a choice the user already made', async () => {
    const p = ports();
    const ui = render(<AnalysisHistoryWorkspace savedTradePending ports={p} LiveCanvas={LiveCanvas} SavedTradeLiveCanvas={SavedTradeLiveCanvas} />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Chart symbol' })).toBeEnabled());
    const picker = screen.getByRole('combobox', { name: 'Chart symbol' });
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: 'BTC' } });
    fireEvent.click(within(screen.getByRole('listbox', { name: 'Symbols' })).getByRole('option', { name: /^BTCUSDT/ }));
    fireEvent.change(screen.getByLabelText('Timeframe'), { target: { value: '1h' } });
    ui.rerender(<AnalysisHistoryWorkspace entry={tradeEntry('ETHUSDT', 2)} ports={p} LiveCanvas={LiveCanvas} SavedTradeLiveCanvas={SavedTradeLiveCanvas} />);
    expect(await screen.findByTestId('saved-trade-canvas')).toHaveTextContent('BTCUSDT/1h');
  });

  it('says so when the trade symbol is not on Binance Spot, and leaves the picker empty', async () => {
    render(<AnalysisHistoryWorkspace entry={tradeEntry('AAPL', 2)} ports={ports()} LiveCanvas={LiveCanvas} SavedTradeLiveCanvas={SavedTradeLiveCanvas} />);
    expect(await screen.findByText("This trade's symbol is not on Binance Spot.")).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Chart symbol' })).toHaveValue('');
    expect(screen.queryByTestId('saved-trade-canvas')).toBeNull();
  });
});

describe('T-007 fix r1: the chart opens on the trade window', () => {
  const HOUR = 60 * 60_000;
  const candleAt = (openMs: number) => ({
    openTime: new Date(openMs).toISOString(), closeTime: new Date(openMs + 5 * 60_000 - 1).toISOString(),
    open: '1' as DecimalString, high: '2' as DecimalString, low: '1' as DecimalString, close: '2' as DecimalString,
  });
  const firstOpen = Date.parse('2026-09-20T00:00:00.000Z');
  const snapshot: MarketCandleHistorySnapshot = {
    source: 'market-reference', timeZone: 'UTC',
    request: { instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' }, interval: '5m', limit: 500 },
    observedAt: '2026-09-21T17:40:00.000Z',
    candles: Array.from({ length: 500 }, (_, index) => candleAt(firstOpen + index * 5 * 60_000)),
  };
  /** A renderer that, like the vendor, fires its first range change inside render (setData). */
  function orderedRenderer(withTimeRange = true) {
    const applied: unknown[] = [];
    const calls: string[] = [];
    const renderer: PresentedChartRenderer = {
      render: vi.fn(() => { calls.push('render'); applied.push('range-event-during-render'); }),
      updateLatestCandle: vi.fn(), setTheme: vi.fn(() => { calls.push('setTheme'); }), resetView: vi.fn(),
      showRecent: vi.fn((count: number) => { calls.push('showRecent'); applied.push(`recent:${count}`); }),
      zoom: vi.fn(), pan: vi.fn(), destroy: vi.fn(),
      ...(withTimeRange ? { showTimeRange: vi.fn((range: { fromMs: number; toMs: number }) => { calls.push('showTimeRange'); applied.push(range); return true; }) } : {}),
    };
    return { renderer, applied, calls, factory: { create: () => renderer } };
  }
  const tradeStart = firstOpen + 20 * HOUR;
  const window = tradeReviewVisibleRange(tradeStart, tradeStart + 3 * HOUR, 5 * 60_000);

  it('applies the trade window after render, so it is the last range the chart gets', () => {
    const chart = orderedRenderer();
    createAnalysisCandleRendererSession({ container: document.createElement('div'), snapshot, themeId: 'kairos-depth', factory: chart.factory, initialWindow: window });
    expect(chart.calls).toEqual(['setTheme', 'render', 'showTimeRange']);
    expect(chart.applied.at(-1)).toEqual(window);
    expect(chart.renderer.showRecent).not.toHaveBeenCalled();
  });

  it('keeps the latest 80 candles when the window misses the loaded candles, or when there is no window', () => {
    const old = tradeReviewVisibleRange(firstOpen - 400 * 24 * HOUR, firstOpen - 399 * 24 * HOUR, 5 * 60_000);
    const missed = orderedRenderer();
    createAnalysisCandleRendererSession({ container: document.createElement('div'), snapshot, themeId: 'kairos-depth', factory: missed.factory, initialWindow: old });
    expect(missed.applied.at(-1)).toBe('recent:80');
    expect(missed.renderer.showTimeRange).not.toHaveBeenCalled();

    const none = orderedRenderer();
    createAnalysisCandleRendererSession({ container: document.createElement('div'), snapshot, themeId: 'kairos-depth', factory: none.factory });
    expect(none.applied.at(-1)).toBe('recent:80');
  });

  it('falls back to the latest 80 candles when the renderer cannot move to a time window', () => {
    const chart = orderedRenderer(false);
    createAnalysisCandleRendererSession({ container: document.createElement('div'), snapshot, themeId: 'kairos-depth', factory: chart.factory, initialWindow: window });
    expect(chart.applied.at(-1)).toBe('recent:80');
  });

  it('the visible-range port moves the vendor time scale in whole seconds, and says when it cannot', () => {
    const setVisibleRange = vi.fn();
    const timeScale = { getVisibleLogicalRange: () => null, subscribeVisibleLogicalRangeChange: vi.fn(), unsubscribeVisibleLogicalRangeChange: vi.fn() };
    const withRange = createLightweightChartsV5VisibleRangePort({ timeScale: () => ({ ...timeScale, setVisibleRange }) } as unknown as LightweightChartsV5ChartApi);
    expect(withRange.setVisibleTimeRange({ fromMs: 1_700_000_000_000, toMs: 1_700_000_600_500 })).toBe(true);
    expect(setVisibleRange).toHaveBeenCalledWith({ from: 1_700_000_000, to: 1_700_000_601 });
    expect(withRange.setVisibleTimeRange({ fromMs: 5, toMs: 5 })).toBe(false);
    const without = createLightweightChartsV5VisibleRangePort({ timeScale: () => timeScale } as unknown as LightweightChartsV5ChartApi);
    expect(without.setVisibleTimeRange({ fromMs: 0, toMs: 1000 })).toBe(false);
  });

  it('the workspace hands the saved-trade chart the trade window for its timeframe', async () => {
    const WindowCanvas = (props: AnalysisSavedTradeOverlayLiveCandleCanvasProps) => {
      const range = useContext(AnalysisTradeWindowContext);
      return <div data-testid="saved-trade-canvas">{props.interval}|{range ? `${range.fromMs}-${range.toMs}` : 'none'}</div>;
    };
    const entry = tradeEntry('ETHUSDT', 2);
    render(<AnalysisHistoryWorkspace entry={entry} ports={ports()} LiveCanvas={LiveCanvas} SavedTradeLiveCanvas={WindowCanvas} />);
    const start = Date.parse((entry.executions[0] as { executedAt: string }).executedAt);
    const expected = tradeReviewVisibleRange(start, start + 3 * HOUR, 15 * 60_000);
    expect(await screen.findByTestId('saved-trade-canvas')).toHaveTextContent(`15m|${expected.fromMs}-${expected.toMs}`);
  });

  it('clears "not on Binance Spot" after choosing another trade', async () => {
    const p = ports();
    const ui = render(<AnalysisHistoryWorkspace entry={tradeEntry('AAPL', 2)} ports={p} LiveCanvas={LiveCanvas} SavedTradeLiveCanvas={SavedTradeLiveCanvas} />);
    expect(await screen.findByText("This trade's symbol is not on Binance Spot.")).toBeTruthy();
    ui.rerender(<AnalysisHistoryWorkspace entry={null} ports={p} LiveCanvas={LiveCanvas} SavedTradeLiveCanvas={SavedTradeLiveCanvas} />);
    await waitFor(() => expect(screen.queryByText("This trade's symbol is not on Binance Spot.")).toBeNull());
  });
});
