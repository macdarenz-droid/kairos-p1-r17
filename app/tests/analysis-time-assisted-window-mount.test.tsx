import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisTimeAssistedSnapshotControls } from '../src/app/AnalysisTimeAssistedSnapshotControls';
import { createAnalysisTimeAssistedWindowSession } from '../src/app/analysisTimeAssistedWindowSession';
import { useAnalysisDrawingTools } from '../src/app/useAnalysisDrawingTools';
import { useAnalysisTimeAssistedWindow } from '../src/app/useAnalysisTimeAssistedWindow';
import { createLightweightChartsV5DriverBinding, type LightweightChartsV5Module } from '../src/features/chart';
import type { MarketCandleHistoryRequest, MarketCandleHistoryResult } from '../src/services/market-data/MarketCandleHistoryPort';
import type { DecimalString } from '../src/domain/trades/tradeTypes';

const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const candleAt = (startTimeMs: number) => ({ openTime: new Date(startTimeMs).toISOString(), closeTime: new Date(startTimeMs + 59_999).toISOString(), open: '2100.5' as DecimalString, high: '2104' as DecimalString, low: '2099.25' as DecimalString, close: '2102' as DecimalString });
const port = { acquireHistory: vi.fn(async (request: MarketCandleHistoryRequest): Promise<MarketCandleHistoryResult> => ({ ok: true, snapshot: { source: 'market-reference', timeZone: 'UTC', request, observedAt: '2026-09-17T12:00:00.000Z', candles: [candleAt(request.startTimeMs!)] } })) };
const now = () => Date.parse('2026-09-17T12:00:00.000Z');
function harness() {
  const setVisibleRange = vi.fn(); let visible: { from: number; to: number } | null = null;
  const timeScale = { getVisibleLogicalRange: () => null, subscribeVisibleLogicalRangeChange: vi.fn(), unsubscribeVisibleLogicalRangeChange: vi.fn(), timeToCoordinate: () => null, setVisibleRange: (r: { from: number; to: number }) => { setVisibleRange(r); visible = r; }, getVisibleRange: () => visible };
  const series = { setData: vi.fn(), update: vi.fn(), attachPrimitive: vi.fn(), detachPrimitive: vi.fn(), priceToCoordinate: () => null, coordinateToPrice: () => null };
  const chart = { timeScale: () => timeScale, subscribeClick: vi.fn(), unsubscribeClick: vi.fn(), subscribeCrosshairMove: vi.fn(), unsubscribeCrosshairMove: vi.fn(), addSeries: () => series, removeSeries: vi.fn(), remove: vi.fn() };
  const module: LightweightChartsV5Module = { createChart: () => chart, LineSeries: { __kairosSeriesData: undefined }, CandlestickSeries: { __kairosSeriesData: undefined } };
  const binding = createLightweightChartsV5DriverBinding(module);
  const handle = binding.driver.createChart(document.createElement('div')).addCandlestickSeries();
  return { binding, handle, setVisibleRange };
}

describe('P22.5 window navigation from the preview through the shared seam', () => {
  it('shows the trade interval on the bound chart, reports the applied range, and stays pending before the chart is live', async () => {
    const h = harness();
    let tools: ReturnType<typeof useAnalysisDrawingTools> | null = null;
    function Harness({ selected }: { selected: boolean }) {
      const key = selected ? 'binance-spot|ETHUSDT|5m|0' : null;
      const estimateWindow = useAnalysisTimeAssistedWindow(key, createAnalysisTimeAssistedWindowSession);
      tools = useAnalysisDrawingTools(selected ? { venue: 'binance-spot', symbol: 'ETHUSDT', interval: '5m', revision: 0 } : null, undefined, estimateWindow.lifecycle);
      return <AnalysisTimeAssistedSnapshotControls instrument={selected ? instrument : null} history={port} now={now} onShowWindow={estimateWindow.show} window={estimateWindow.last} windowNow={now} />;
    }
    const view = render(<Harness selected />);
    fireEvent.change(screen.getByLabelText('Snapshot opened at'), { target: { value: '2026-09-10T02:13:27' } });
    fireEvent.change(screen.getByLabelText('Snapshot closed at'), { target: { value: '2026-09-10T04:30:05' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Estimate' })); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Show on chart' })).toBeTruthy());
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Show on chart' })); });
    expect(screen.getByText('The chart is not live yet; try again once candles are connected.').getAttribute('data-time-assisted-window')).toBe('pending-chart');
    // The drawing-tools lifecycle carries the window lifecycle to the same chart and handle.
    act(() => { tools!.lifecycle.attach(h.binding, h.handle); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Show on chart' })); });
    const fromMs = Date.parse('2026-09-10T02:13:27'), toMs = Date.parse('2026-09-10T04:30:05');
    const padding = Math.max(300_000, Math.round((toMs - fromMs) * 0.15));
    expect(h.setVisibleRange).toHaveBeenCalledWith({ from: Math.floor((fromMs - padding) / 1000), to: Math.ceil((toMs + padding) / 1000) });
    await waitFor(() => expect(screen.getByText(/The chart now shows 2026-09-10 /).getAttribute('data-time-assisted-window')).toBe('shown'));
    // An open trade's window runs to the injected clock.
    fireEvent.change(screen.getByLabelText('Snapshot closed at'), { target: { value: '' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Estimate' })); });
    await waitFor(() => expect(screen.getByText(/still open/)).toBeTruthy());
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Show on chart' })); });
    const openPadding = Math.max(300_000, Math.round((now() - fromMs) * 0.15));
    expect(h.setVisibleRange).toHaveBeenLastCalledWith({ from: Math.floor((fromMs - openPadding) / 1000), to: Math.ceil((now() + openPadding) / 1000) });
    act(() => { tools!.lifecycle.detach(h.handle); });
    view.rerender(<Harness selected={false} />);
    expect(screen.queryByRole('button', { name: 'Show on chart' })).toBeNull();
    view.unmount();
  });
});
