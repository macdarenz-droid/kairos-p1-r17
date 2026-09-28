import { describe, expect, it, vi } from 'vitest';
import { createAnalysisDrawingToolsRendererSession } from '../src/features/analysis/analysisDrawingToolsRendererSession';
import { createLightweightChartsV5DriverBinding, type LightweightChartsV5Module } from '../src/features/chart';
import type { ChartDrawingInteractionState } from '../src/features/chart';
import type { DecimalString } from '../src/domain/trades/tradeTypes';

type ClickHandler = (event: { time?: number; point?: { x: number; y: number }; hoveredInfo?: { sourceKind: 'series-primitive'; objectKind: 'primitive'; objectId?: unknown } }) => void;

function createHarness() {
  const attached: unknown[] = [], detached: unknown[] = [];
  const clickHandlers = new Set<ClickHandler>();
  const series = {
    setData: vi.fn(), update: vi.fn(),
    priceToCoordinate: (price: number) => price * 2,
    coordinateToPrice: (coordinate: number) => coordinate / 2,
    attachPrimitive: (primitive: unknown) => attached.push(primitive),
    detachPrimitive: (primitive: unknown) => detached.push(primitive),
  };
  const chart = {
    timeScale: () => ({ getVisibleLogicalRange: () => null, subscribeVisibleLogicalRangeChange: vi.fn(), unsubscribeVisibleLogicalRangeChange: vi.fn(), timeToCoordinate: (time: unknown) => (typeof time === 'number' ? time : null) }),
    subscribeClick: (handler: ClickHandler) => { clickHandlers.add(handler); },
    unsubscribeClick: (handler: ClickHandler) => { clickHandlers.delete(handler); },
    subscribeCrosshairMove: vi.fn(), unsubscribeCrosshairMove: vi.fn(),
    addSeries: () => series, removeSeries: vi.fn(), remove: vi.fn(),
  };
  const module: LightweightChartsV5Module = { createChart: () => chart, LineSeries: { __kairosSeriesData: undefined }, CandlestickSeries: { __kairosSeriesData: undefined } };
  const binding = createLightweightChartsV5DriverBinding(module);
  const engineChart = binding.driver.createChart(document.createElement('div'));
  const click = (time: number, y: number, objectId?: string, x = 10) => { for (const handler of Array.from(clickHandlers)) handler({ time, point: { x, y }, ...(objectId === undefined ? {} : { hoveredInfo: { sourceKind: 'series-primitive' as const, objectKind: 'primitive' as const, objectId } }) }); };
  return { binding, engineChart, click, attached, detached, clickHandlers, series };
}

describe('Analysis drawing tools renderer session', () => {
  it('stays pending until the seam attaches, then draws and commits a trend line from two provider clicks through the released owners', () => {
    const states: ChartDrawingInteractionState['status'][] = [];
    const drawings = vi.fn();
    const h = createHarness();
    const session = createAnalysisDrawingToolsRendererSession({ style: { color: '#fff', lineWidth: 2 }, onStateChange: state => states.push(state.status), onDrawingsChange: drawings });
    expect(session.presentation()).toEqual({ kind: 'pending-series' });
    expect(session.selectTrendLineTool()).toBe(false);
    expect(session.getState()).toBeNull();
    const handle = h.engineChart.addCandlestickSeries();
    session.lifecycle.attach(h.binding, handle);
    expect(session.presentation()).toEqual({ kind: 'bound', drawingCount: 0 });
    expect(h.clickHandlers.size).toBe(1);
    // The released P18.4 layer driver swaps one primitive per refresh: exactly one stays attached.
    expect(h.attached.length - h.detached.length).toBe(1);
    expect(session.getState()).toEqual({ status: 'idle' });
    expect(session.selectTrendLineTool()).toBe(true);
    h.click(1_757_000_000, 200);
    expect(session.getState()).toEqual({ status: 'drawing', tool: 'trend-line' });
    h.click(1_757_000_300, 260);
    expect(session.getState()?.status).toBe('committed');
    expect(session.getDrawings()).toHaveLength(1);
    expect(session.getDrawings()[0]).toMatchObject({ kind: 'trend-line', start: { price: '100' }, end: { price: '130' } });
    expect(states).toEqual(['tool-selected', 'drawing', 'preview', 'committed']);
    expect(drawings).toHaveBeenCalledTimes(1);
    expect(session.presentation()).toEqual({ kind: 'bound', drawingCount: 1 });
    session.destroy();
    expect(h.clickHandlers.size).toBe(0);
    expect(h.attached.length - h.detached.length).toBe(0);
  });

  it('re-presents the same committed drawings on a replacement series and clears the click lifecycle on detach', () => {
    const h = createHarness();
    const session = createAnalysisDrawingToolsRendererSession({ style: { color: '#fff', lineWidth: 2 } });
    const first = h.engineChart.addCandlestickSeries();
    session.lifecycle.attach(h.binding, first);
    session.selectTrendLineTool(); h.click(1_757_000_000, 200); h.click(1_757_000_300, 260);
    expect(session.getDrawings()).toHaveLength(1);
    session.lifecycle.detach(first);
    expect(session.presentation()).toEqual({ kind: 'pending-series' });
    expect(session.getState()).toBeNull();
    expect(h.clickHandlers.size).toBe(0);
    expect(h.attached.length - h.detached.length).toBe(0);
    const second = h.engineChart.addCandlestickSeries();
    session.lifecycle.attach(h.binding, second);
    expect(session.presentation()).toEqual({ kind: 'bound', drawingCount: 1 });
    expect(h.attached.length - h.detached.length).toBe(1);
    expect(session.getDrawings()).toHaveLength(1);
    session.lifecycle.detach(first);
    expect(session.presentation()).toEqual({ kind: 'bound', drawingCount: 1 });
    session.destroy();
    expect(() => session.lifecycle.attach(h.binding, second)).toThrow('analysis-drawing-tools-session-destroyed');
  });

  it('cancels a draft, ignores clicks while idle, and deletes only a selected drawing through the released deletion coordinators', () => {
    const drawings = vi.fn();
    const h = createHarness();
    const session = createAnalysisDrawingToolsRendererSession({ style: { color: '#fff', lineWidth: 2 }, onDrawingsChange: drawings });
    session.lifecycle.attach(h.binding, h.engineChart.addCandlestickSeries());
    expect(session.cancel()).toBe(false);
    session.selectTrendLineTool(); h.click(1_757_000_000, 200);
    expect(session.cancel()).toBe(true);
    expect(session.getState()).toEqual({ status: 'idle' });
    h.click(1_757_000_300, 260);
    expect(session.getDrawings()).toHaveLength(0);
    expect(session.deleteSelected()).toBeNull();
    session.selectTrendLineTool(); h.click(1_757_000_000, 200); h.click(1_757_000_300, 260);
    const drawing = session.getDrawings()[0];
    expect(session.selectTrendLineTool()).toBe(true);
    expect(session.cancel()).toBe(true);
    expect(session.getDrawings()).toEqual([drawing]);
    expect(drawings).toHaveBeenCalledTimes(1);
    // A provider hit on the committed line (P18.13 externalId surfaced as hoveredInfo.objectId) selects it through P18.41/P18.42; delete removes exactly it.
    h.click(1_757_000_000, 200, 'not-a-drawing');
    expect(session.getState()).toEqual({ status: 'idle' });
    h.click(1_757_000_000, 200, drawing.id);
    expect(session.getState()).toEqual({ status: 'selected', drawingId: drawing.id });
    expect(session.deleteSelected()).toEqual(drawing);
    expect(session.getDrawings()).toEqual([]);
    expect(drawings).toHaveBeenCalledTimes(2);
    expect(session.presentation()).toEqual({ kind: 'bound', drawingCount: 0 });
    session.destroy();
  });

  it('moves a selected endpoint through the released P18.58/P18.59 edit when a tolerance is configured, and never without one', () => {
    const drawings = vi.fn(); const states: string[] = [];
    const h = createHarness();
    const session = createAnalysisDrawingToolsRendererSession({ style: { color: '#fff', lineWidth: 2 }, endpointEditTolerancePx: 8, onDrawingsChange: drawings, onStateChange: state => states.push(state.status) });
    session.lifecycle.attach(h.binding, h.engineChart.addCandlestickSeries());
    session.selectTrendLineTool(); h.click(1_757_000_000, 200); h.click(1_757_000_300, 260);
    const [placed] = session.getDrawings();
    session.selectTrendLineTool(); session.cancel();
    h.click(1_757_000_000, 200, placed.id);
    expect(session.getState()).toEqual({ status: 'selected', drawingId: placed.id });
    // The fake time scale maps epoch seconds to x and the series maps price to 2y: the end endpoint projects to (1_757_000_300, 260); a click 5px away grabs it.
    h.click(1_757_000_300, 265, placed.id, 1_757_000_300);
    expect(session.getState()).toEqual({ status: 'editing', drawingId: placed.id, endpoint: 'end' });
    h.click(1_757_000_600, 300);
    expect(session.getState()).toEqual({ status: 'idle' });
    expect(session.getDrawings()).toHaveLength(1);
    expect(session.getDrawings()[0]).toMatchObject({ id: placed.id, start: { price: '100' }, end: { price: '150' } });
    expect(drawings).toHaveBeenCalledTimes(2);
    expect(states.slice(-3)).toEqual(['selected', 'editing', 'idle']);
    // A far click while selected is not an endpoint grab: the released reducer keeps the selection.
    h.click(1_757_000_000, 200, placed.id);
    h.click(1_757_000_150, 400);
    expect(session.getState()).toEqual({ status: 'selected', drawingId: placed.id });
    // Cancel while editing keeps the line unchanged.
    h.click(1_757_000_000, 205, placed.id, 1_757_000_000);
    expect(session.getState()?.status).toBe('editing');
    expect(session.cancel()).toBe(true);
    expect(session.getDrawings()[0]).toMatchObject({ start: { price: '100' }, end: { price: '150' } });
    session.destroy();

    const plain = createHarness();
    const noEdit = createAnalysisDrawingToolsRendererSession({ style: { color: '#fff', lineWidth: 2 } });
    noEdit.lifecycle.attach(plain.binding, plain.engineChart.addCandlestickSeries());
    noEdit.selectTrendLineTool(); plain.click(1_757_000_000, 200); plain.click(1_757_000_300, 260);
    const [line] = noEdit.getDrawings();
    noEdit.selectTrendLineTool(); noEdit.cancel();
    plain.click(1_757_000_000, 200, line.id);
    plain.click(1_757_000_300, 262, line.id, 1_757_000_300);
    expect(noEdit.getState()).toEqual({ status: 'selected', drawingId: line.id });
    noEdit.destroy();
  });

  it('loads drawings with stable ids through the released collection, re-presents them on the bound series and resets any draft', () => {
    const drawings = vi.fn(); const states: string[] = [];
    const h = createHarness();
    const session = createAnalysisDrawingToolsRendererSession({ style: { color: '#fff', lineWidth: 2 }, onDrawingsChange: drawings, onStateChange: state => states.push(state.status) });
    const loaded = [{ id: 'saved-1', kind: 'trend-line' as const, start: { timestamp: '2025-09-04T14:13:20.000Z', price: '100' as DecimalString }, end: { timestamp: '2025-09-04T14:18:20.000Z', price: '130' as DecimalString } }];
    // Before any series is bound the collection still takes the drawings.
    expect(session.loadDrawings(loaded)).toEqual(loaded);
    expect(session.presentation()).toEqual({ kind: 'pending-series' });
    session.lifecycle.attach(h.binding, h.engineChart.addCandlestickSeries());
    expect(session.presentation()).toEqual({ kind: 'bound', drawingCount: 1 });
    // A draft in progress is reset; the previous drawings are replaced, not merged.
    session.selectTrendLineTool(); h.click(1_757_000_000, 200);
    expect(session.getState()?.status).toBe('drawing');
    const replacement = [{ ...loaded[0], id: 'saved-2', end: { timestamp: '2025-09-04T14:18:20.000Z', price: '150' as DecimalString } }, { ...loaded[0], id: 'saved-3' }];
    expect(session.loadDrawings(replacement)).toEqual(replacement);
    expect(session.getState()).toEqual({ status: 'idle' });
    expect(session.getDrawings().map(d => d.id)).toEqual(['saved-2', 'saved-3']);
    expect(h.attached.length - h.detached.length).toBe(1);
    expect(drawings).toHaveBeenCalledTimes(2);
    expect(states.slice(-2)).toEqual(['cancelled', 'idle']);
    // Loaded drawings select and delete like drawn ones.
    h.click(1_757_000_000, 200, 'saved-3');
    expect(session.getState()).toEqual({ status: 'selected', drawingId: 'saved-3' });
    expect(session.deleteSelected()?.id).toBe('saved-3');
    expect(session.loadDrawings([])).toEqual([]);
    expect(session.presentation()).toEqual({ kind: 'bound', drawingCount: 0 });
    session.destroy();
  });
});
