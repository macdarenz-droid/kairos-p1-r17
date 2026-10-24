import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisTimeAssistedSnapshotControls } from '../src/app/AnalysisTimeAssistedSnapshotControls';
import { createAnalysisSavedTimeAssistedSnapshotPorts } from '../src/app/analysisSavedTimeAssistedSnapshotRoundTrip';
import { createAnalysisTimeAssistedWindowSession } from '../src/app/analysisTimeAssistedWindowSession';
import { useAnalysisDrawingTools } from '../src/app/useAnalysisDrawingTools';
import { useAnalysisTimeAssistedWindow } from '../src/app/useAnalysisTimeAssistedWindow';
import { createLightweightChartsV5DriverBinding, type LightweightChartsV5Module } from '../src/features/chart';
import type { EstimatedMarketReference, TimeAssistedTradeSnapshot } from '../src/application/market-reference';
import { saveSavedTimeAssistedSnapshot } from '../src/application/saved-time-assisted-snapshot';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import type { DecimalString } from '../src/domain/trades/tradeTypes';

const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const candleAt = (startTimeMs: number) => ({ openTime: new Date(startTimeMs).toISOString(), closeTime: new Date(startTimeMs + 59_999).toISOString(), open: '2100.5' as DecimalString, high: '2104' as DecimalString, low: '2099.25' as DecimalString, close: '2102' as DecimalString });
const estimate = (requestedAt: string): EstimatedMarketReference => ({ kind: 'candle-range', isEstimate: true, source: 'market-reference', method: 'containing-candle', resolution: '1m', instrument, requestedAt, requestedAtUtc: new Date(Date.parse(requestedAt)).toISOString(), candle: candleAt(Math.floor(Date.parse(requestedAt) / 60_000) * 60_000), gapMs: Date.parse(requestedAt) % 60_000, acquiredAt: '2026-09-17T12:00:00.000Z' }) as EstimatedMarketReference;
const OPENED = '2026-09-10T02:13:27', CLOSED = '2026-09-10T04:30:05';
// This device's time, read with Date's own local getters: "10 Sep 02:13" (with the year when it is not this year).
const localWhen = (iso: string) => { const at = new Date(iso); const year = at.getFullYear() === new Date().getFullYear() ? '' : ` ${at.getFullYear()}`; return `${at.getDate()} ${at.toLocaleString('en-GB', { month: 'short' })}${year} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`; };
const names: string[] = [];
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });
// U14 (D12): Analysis makes no new estimates, so a closed and an open one are seeded through their save command.
async function seeded() {
  const name = `kairos-time-assisted-window-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db);
  const snapshot = (closing: EstimatedMarketReference | null) => ({ kind: 'snapshot', isEstimate: true, source: 'market-reference', instrument, side: 'long', opening: estimate(OPENED), closing, durationMs: closing === null ? null : Date.parse(CLOSED) - Date.parse(OPENED) }) as TimeAssistedTradeSnapshot;
  const closed = await saveSavedTimeAssistedSnapshot(db, { snapshot: snapshot(estimate(CLOSED)), inputTimeZone: 'UTC' }, { now: () => Date.parse('2026-09-17T10:00:00.000Z') });
  const open = await saveSavedTimeAssistedSnapshot(db, { snapshot: snapshot(null), inputTimeZone: 'UTC' }, { now: () => Date.parse('2026-09-17T11:00:00.000Z') });
  if (!closed.ok || !open.ok) throw new Error('seed');
  return { ports: createAnalysisSavedTimeAssistedSnapshotPorts(db), closedId: closed.savedTimeAssistedSnapshotId, openId: open.savedTimeAssistedSnapshotId };
}
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
    const { ports, closedId, openId } = await seeded();
    let tools: ReturnType<typeof useAnalysisDrawingTools> | null = null;
    function Harness({ selected }: { selected: boolean }) {
      const key = selected ? 'binance-spot|ETHUSDT|5m|0' : null;
      const estimateWindow = useAnalysisTimeAssistedWindow(key, createAnalysisTimeAssistedWindowSession);
      tools = useAnalysisDrawingTools(selected ? { venue: 'binance-spot', symbol: 'ETHUSDT', interval: '5m', revision: 0 } : null, undefined, estimateWindow.lifecycle);
      return <AnalysisTimeAssistedSnapshotControls instrument={selected ? instrument : null} saved={ports} onShowWindow={estimateWindow.show} window={estimateWindow.last} windowNow={now} />;
    }
    const view = render(<Harness selected />);
    const load = async (id: string) => {
      await waitFor(() => expect(screen.getByRole('button', { name: 'Open estimate' })).toHaveProperty('disabled', false));
      fireEvent.change(screen.getByLabelText('Saved estimate'), { target: { value: id } });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open estimate' })); });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Show on chart' })).toBeTruthy());
    };
    await load(closedId);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Show on chart' })); });
    expect(screen.getByText("The chart isn't showing prices yet. Try again once it does.").getAttribute('data-time-assisted-window')).toBe('pending-chart');
    // The drawing-tools lifecycle carries the window lifecycle to the same chart and handle.
    act(() => { tools!.lifecycle.attach(h.binding, h.handle); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Show on chart' })); });
    const fromMs = Date.parse(OPENED), toMs = Date.parse(CLOSED);
    const padding = Math.max(300_000, Math.round((toMs - fromMs) * 0.15));
    expect(h.setVisibleRange).toHaveBeenCalledWith({ from: Math.floor((fromMs - padding) / 1000), to: Math.ceil((toMs + padding) / 1000) });
    const shown = `The chart now shows ${localWhen(new Date(Math.floor((fromMs - padding) / 1000) * 1000).toISOString())} to ${localWhen(new Date(Math.ceil((toMs + padding) / 1000) * 1000).toISOString())}.`;
    await waitFor(() => expect(screen.getByText(shown).getAttribute('data-time-assisted-window')).toBe('shown'));
    // An open trade's window runs to the injected clock.
    await load(openId);
    await waitFor(() => expect(document.querySelector('[data-time-assisted-times]')!.textContent).toMatch(/· still open$/));
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Show on chart' })); });
    const openPadding = Math.max(300_000, Math.round((now() - fromMs) * 0.15));
    expect(h.setVisibleRange).toHaveBeenLastCalledWith({ from: Math.floor((fromMs - openPadding) / 1000), to: Math.ceil((now() + openPadding) / 1000) });
    act(() => { tools!.lifecycle.detach(h.handle); });
    view.rerender(<Harness selected={false} />);
    expect(screen.queryByRole('button', { name: 'Show on chart' })).toBeNull();
    view.unmount();
  });
});
