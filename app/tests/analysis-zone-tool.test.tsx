import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisDrawingToolsControls } from '../src/features/analysis/AnalysisDrawingToolsControls';
import { AnalysisSavedAnalysisControls } from '../src/app/AnalysisSavedAnalysisControls';
import { analysisMarketReference, createAnalysisSavedAnalysisPorts } from '../src/app/analysisSavedAnalysisRoundTrip';
import { useAnalysisDrawingTools } from '../src/app/useAnalysisDrawingTools';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import type { DecimalString } from '../src/domain/trades/tradeTypes';
import { createLightweightChartsV5DriverBinding, type ChartDrawing, type LightweightChartsV5Module } from '../src/features/chart';

type ClickHandler = (event: { time?: number; point?: { x: number; y: number }; hoveredInfo?: { sourceKind: 'series-primitive'; objectKind: 'primitive'; objectId?: unknown } }) => void;

/** A fake lightweight-charts v5 module shaped like the Gate475 renderer-session fixture: enough for the seam, clicks and primitives. */
function createFakeChartHarness() {
  const attached: unknown[] = [], detached: unknown[] = [];
  const clickHandlers = new Set<ClickHandler>();
  const series = { setData: vi.fn(), update: vi.fn(), priceToCoordinate: (price: number) => price * 2, coordinateToPrice: (coordinate: number) => coordinate / 2, attachPrimitive: (primitive: unknown) => attached.push(primitive), detachPrimitive: (primitive: unknown) => detached.push(primitive) };
  const chart = {
    timeScale: () => ({ getVisibleLogicalRange: () => null, subscribeVisibleLogicalRangeChange: vi.fn(), unsubscribeVisibleLogicalRangeChange: vi.fn(), timeToCoordinate: (time: unknown) => (typeof time === 'number' ? time : null) }),
    subscribeClick: (handler: ClickHandler) => { clickHandlers.add(handler); }, unsubscribeClick: (handler: ClickHandler) => { clickHandlers.delete(handler); },
    subscribeCrosshairMove: vi.fn(), unsubscribeCrosshairMove: vi.fn(), addSeries: () => series, removeSeries: vi.fn(), remove: vi.fn(),
  };
  const module: LightweightChartsV5Module = { createChart: () => chart, LineSeries: { __kairosSeriesData: undefined }, CandlestickSeries: { __kairosSeriesData: undefined } };
  const binding = createLightweightChartsV5DriverBinding(module);
  const handle = binding.driver.createChart(document.createElement('div')).addCandlestickSeries();
  const click = (time: number, y: number, objectId?: string, x = 10) => { for (const handler of Array.from(clickHandlers)) handler({ time, point: { x, y }, ...(objectId === undefined ? {} : { hoveredInfo: { sourceKind: 'series-primitive' as const, objectKind: 'primitive' as const, objectId } }) }); };
  return { binding, handle, click, attached, detached, clickHandlers };
}


let latest: ReturnType<typeof useAnalysisDrawingTools> | null = null;
function Harness() {
  const tools = useAnalysisDrawingTools({ venue: 'binance-spot', symbol: 'ETHUSDT', interval: '5m', revision: 0 });
  latest = tools;
  return <AnalysisDrawingToolsControls state={tools.state} drawingCount={tools.drawingCount} onSelectTrendLine={tools.selectTrendLineTool} onCancel={tools.cancel} onDeleteSelected={tools.deleteSelected} onSelectZone={tools.selectZoneTool} zoneCount={tools.zoneCount} selectedKind={tools.selectedKind} />;
}
const group = () => screen.getByRole('group', { name: 'Drawing tools' });
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const guidance = () => group().querySelector('[data-drawing-guidance]')!.textContent ?? '';
const T1 = 1_757_000_000, T2 = 1_757_000_300;

function placeZone() {
  const h = createFakeChartHarness();
  const view = render(<Harness />);
  act(() => { latest!.lifecycle.attach(h.binding, h.handle); });
  act(() => { fireEvent.click(button('Zone')); });
  expect(guidance()).toContain('Zone: tap the first corner on the chart.');
  expect(button('Zone').getAttribute('aria-pressed')).toBe('true');
  expect(button('Trend line').getAttribute('aria-pressed')).toBe('false');
  act(() => { h.click(T1, 200, undefined, T1); });
  expect(guidance()).toContain('Zone: tap the opposite corner to place it.');
  act(() => { h.click(T2, 260, undefined, T2); });
  return { h, view };
}

describe('the Zone tool', () => {
  it('places a zone with two taps', () => {
    const { view } = placeZone();
    expect(group().getAttribute('data-zone-count')).toBe('1');
    expect(screen.getByText(/1 zone on this chart/)).toBeTruthy();
    expect(latest!.getDrawings()[0]).toMatchObject({ kind: 'zone', start: { price: '100' }, end: { price: '130' } });
    expect(guidance()).toContain('Tap a line or zone to select it.');
    view.unmount();
  });

  it('selects a zone from a tap inside it, then deletes it', () => {
    const { h, view } = placeZone();
    act(() => { h.click(T1 + 100, 230, undefined, T1 + 100); });
    expect(group().getAttribute('data-drawing-status')).toBe('selected');
    expect(guidance()).toContain('Zone selected. Tap one of its corner squares, then tap where it should go. Delete removes it.');
    act(() => { fireEvent.click(button('Delete zone')); });
    expect(group().getAttribute('data-drawing-count')).toBe('0');
    expect(group().getAttribute('data-zone-count')).toBe('0');
    expect(button('Delete').disabled).toBe(true);
    view.unmount();
  });

  it('moves a zone corner and keeps the kind', () => {
    const { h, view } = placeZone();
    act(() => { h.click(T1 + 100, 230, undefined, T1 + 100); });
    act(() => { h.click(T2, 262, undefined, T2); });
    expect(group().getAttribute('data-drawing-status')).toBe('editing');
    expect(guidance()).toContain('Moving a corner: tap where it should go. Cancel keeps the zone.');
    act(() => { h.click(T2 + 60, 300, undefined, T2 + 60); });
    const [moved] = latest!.getDrawings();
    expect(moved).toMatchObject({ kind: 'zone', start: { price: '100' }, end: { price: '150' } });
    view.unmount();
  });

  it('counts lines and zones together', () => {
    const { h, view } = placeZone();
    act(() => { fireEvent.click(button('Trend line')); });
    act(() => { h.click(T1, 400, undefined, T1); });
    act(() => { h.click(T2, 500, undefined, T2); });
    expect(screen.getByText(/1 line · 1 zone on this chart/)).toBeTruthy();
    view.unmount();
  });
});

const names: string[] = [];
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });
const anchor = (timestamp: string, price: string) => ({ timestamp, price: price as DecimalString });

describe('saving a line and a zone', () => {
  it('says "with 1 line and 1 zone." and loads both back', async () => {
    const name = `kairos-zone-save-${crypto.randomUUID()}`; names.push(name);
    const db = createKairosDatabase(name); await openKairosDatabase(db);
    const drawings: ChartDrawing[] = [
      { id: 'l1', kind: 'trend-line', start: anchor('2026-09-10T02:00:00.000Z', '2100'), end: anchor('2026-09-10T03:00:00.000Z', '2300') },
      { id: 'z1', kind: 'zone', start: anchor('2026-09-10T02:00:00.000Z', '2200'), end: anchor('2026-09-10T04:00:00.000Z', '2150') },
    ];
    const onLoad = vi.fn();
    render(<AnalysisSavedAnalysisControls ports={createAnalysisSavedAnalysisPorts(db)} market={analysisMarketReference({ venue: 'binance-spot', symbol: 'ETHUSDT' })} drawingCount={2} getDrawings={() => drawings} onLoad={onLoad} />);
    const saved = () => screen.getByRole('group', { name: 'Saved analysis' });
    await waitFor(() => expect(saved().getAttribute('data-saved-analysis-count')).toBe('0'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save analysis' })); });
    expect(await screen.findByText(/with 1 line and 1 zone\./)).toBeTruthy();
    await waitFor(() => expect(saved().getAttribute('data-saved-analysis-count')).toBe('1'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Load analysis' })); });
    await waitFor(() => expect(onLoad).toHaveBeenCalledWith(drawings));
  });
});
