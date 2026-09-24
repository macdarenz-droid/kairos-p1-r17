import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisHistoryWorkspace } from '../src/app/AnalysisHistoryWorkspace';
import type { AnalysisLiveCandleCanvasProps } from '../src/app/AnalysisLiveCandleCanvas';
import type { AnalysisSavedTradeOverlayLiveCandleCanvasProps } from '../src/app/AnalysisSavedTradeOverlayLiveCandleCanvas';
import { createAnalysisTradeFocusLifecycle } from '../src/app/useAnalysisTradeFocus';
import type { JournalHistoryEntry } from '../src/application/journal';
import type { ChartEngineSeriesHandle } from '../src/features/chart/chartEngineDriver';
import type { LightweightChartsV5DriverBinding, LightweightChartsV5LogicalRangeChangeHandler } from '../src/features/chart/lightweightChartsV5ModuleAdapter';
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

describe('T-007 trade focus lifecycle', () => {
  function fakeChart(initialRange: { from: number; to: number } | null) {
    let handler: LightweightChartsV5LogicalRangeChangeHandler | null = null;
    const timeScale = {
      getVisibleLogicalRange: vi.fn(() => initialRange),
      subscribeVisibleLogicalRangeChange: vi.fn((next: LightweightChartsV5LogicalRangeChangeHandler) => { handler = next; }),
      unsubscribeVisibleLogicalRangeChange: vi.fn(() => { handler = null; }),
      setVisibleRange: vi.fn(),
    };
    const binding = { resolveChart: () => ({ timeScale: () => timeScale }) } as unknown as LightweightChartsV5DriverBinding;
    return { timeScale, binding, emit: (range: { from: number; to: number } | null) => handler?.(range) };
  }
  const handle = {} as ChartEngineSeriesHandle;
  const range = { fromMs: 1_700_000_000_000, toMs: 1_700_000_600_500 };

  it('waits for candles, applies the trade window once in seconds, then lets the user move freely', () => {
    const chart = fakeChart(null);
    createAnalysisTradeFocusLifecycle(range).attach(chart.binding, handle);
    expect(chart.timeScale.setVisibleRange).not.toHaveBeenCalled();
    chart.emit(null);
    expect(chart.timeScale.setVisibleRange).not.toHaveBeenCalled();
    chart.emit({ from: 0, to: 499 });
    expect(chart.timeScale.setVisibleRange).toHaveBeenCalledWith({ from: 1_700_000_000, to: 1_700_000_601 });
    expect(chart.timeScale.unsubscribeVisibleLogicalRangeChange).toHaveBeenCalledTimes(1);
    chart.emit({ from: 10, to: 60 });
    expect(chart.timeScale.setVisibleRange).toHaveBeenCalledTimes(1);
  });

  it('applies at once when candles are already in, and a detach before candles applies nothing', () => {
    const loaded = fakeChart({ from: 0, to: 499 });
    createAnalysisTradeFocusLifecycle(range).attach(loaded.binding, handle);
    expect(loaded.timeScale.setVisibleRange).toHaveBeenCalledTimes(1);

    const empty = fakeChart(null);
    const lifecycle = createAnalysisTradeFocusLifecycle(range);
    lifecycle.attach(empty.binding, handle);
    lifecycle.detach(handle);
    expect(empty.timeScale.unsubscribeVisibleLogicalRangeChange).toHaveBeenCalledTimes(1);
    empty.emit({ from: 0, to: 499 });
    expect(empty.timeScale.setVisibleRange).not.toHaveBeenCalled();
  });
});
