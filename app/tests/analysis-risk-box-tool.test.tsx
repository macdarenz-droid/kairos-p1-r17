import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisDrawingToolsControls } from '../src/features/analysis/AnalysisDrawingToolsControls';
import { riskBoxLabel } from '../src/features/analysis/analysisDrawingToolsRendererSession';
import { useAnalysisDrawingTools } from '../src/app/useAnalysisDrawingTools';
import type { SavedRiskRewardAnalysis } from '../src/domain/saved-records/savedAnalysisContract';
import type { DecimalString } from '../src/domain/trades';
import { createLightweightChartsV5DriverBinding, type LightweightChartsV5Module } from '../src/features/chart';

type ClickHandler = (event: { time?: number; point?: { x: number; y: number }; hoveredInfo?: { sourceKind: 'series-primitive'; objectKind: 'primitive'; objectId?: unknown } }) => void;

interface PaintablePrimitive {
  attached(parameter: unknown): void;
  updateAllViews(): void;
  paneViews(): readonly { renderer(): { draw(target: unknown): void } }[];
}

/** The same fake lightweight-charts v5 module as the drawing-tools mount test: price p sits at y = 2p, time t at x = t. */
function createFakeChartHarness() {
  const attached: PaintablePrimitive[] = [], detached: unknown[] = [];
  const clickHandlers = new Set<ClickHandler>();
  const series = { setData: vi.fn(), update: vi.fn(), priceToCoordinate: (price: number) => price * 2, coordinateToPrice: (coordinate: number) => coordinate / 2, attachPrimitive: (primitive: PaintablePrimitive) => attached.push(primitive), detachPrimitive: (primitive: unknown) => detached.push(primitive) };
  const timeScale = () => ({ getVisibleLogicalRange: () => null, subscribeVisibleLogicalRangeChange: vi.fn(), unsubscribeVisibleLogicalRangeChange: vi.fn(), timeToCoordinate: (time: unknown) => (typeof time === 'number' ? time : null) });
  const chart = {
    timeScale,
    subscribeClick: (handler: ClickHandler) => { clickHandlers.add(handler); }, unsubscribeClick: (handler: ClickHandler) => { clickHandlers.delete(handler); },
    subscribeCrosshairMove: vi.fn(), unsubscribeCrosshairMove: vi.fn(), addSeries: () => series, removeSeries: vi.fn(), remove: vi.fn(),
  };
  const module: LightweightChartsV5Module = { createChart: () => chart, LineSeries: { __kairosSeriesData: undefined }, CandlestickSeries: { __kairosSeriesData: undefined } };
  const binding = createLightweightChartsV5DriverBinding(module);
  const handle = binding.driver.createChart(document.createElement('div')).addCandlestickSeries();
  const click = (time: number, price: number, x = 10) => { for (const handler of Array.from(clickHandlers)) handler({ time, point: { x, y: price * 2 } }); };
  /** Paints the latest drawing primitive and returns its fillText labels and fillRect count. */
  const paintLatest = () => {
    const primitive = attached.at(-1)!;
    primitive.attached({ chart: { timeScale }, series, requestUpdate: () => undefined });
    primitive.updateAllViews();
    const labels: string[] = [];
    let fills = 0, strokes = 0;
    const context = new Proxy({} as Record<string, unknown>, {
      get: (_target, key) => {
        if (key === 'fillText') return (text: string) => labels.push(text);
        if (key === 'fillRect') return () => { fills += 1; };
        if (key === 'stroke') return () => { strokes += 1; };
        return () => undefined;
      },
      set: () => true,
    });
    primitive.paneViews()[0].renderer().draw({ useBitmapCoordinateSpace: (paint: (scope: unknown) => void) => paint({ context, horizontalPixelRatio: 1, verticalPixelRatio: 1 }) });
    return { labels, fills, strokes };
  };
  return { binding, handle, click, paintLatest, clickHandlers };
}

const T0 = 1_757_000_000;

describe('T-022c risk box tool', () => {
  let latest: ReturnType<typeof useAnalysisDrawingTools> | null = null;
  function Harness() {
    const tools = useAnalysisDrawingTools({ venue: 'binance-spot', symbol: 'ETHUSDT', interval: '5m', revision: 0 });
    latest = tools;
    return <AnalysisDrawingToolsControls state={tools.state} drawingCount={tools.drawingCount} onSelectTrendLine={tools.selectTrendLineTool} onCancel={tools.cancel} onDeleteSelected={tools.deleteSelected} onSelectZone={tools.selectZoneTool} zoneCount={tools.zoneCount} selectedKind={tools.selectedKind} onSelectRiskBox={tools.selectRiskBoxTool} riskBoxCount={tools.riskBoxCount} selectedLabel={tools.selectedLabel} />;
  }
  const group = () => screen.getByRole('group', { name: 'Drawing tools' });
  const status = () => group().getAttribute('data-drawing-status');
  const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

  function mount() {
    const h = createFakeChartHarness();
    const view = render(<Harness />);
    act(() => { latest!.lifecycle.attach(h.binding, h.handle); });
    return { h, view };
  }

  function drawBox(h: ReturnType<typeof createFakeChartHarness>, entry: number, stop: number, target: number) {
    act(() => { fireEvent.click(button('Risk box')); });
    act(() => { h.click(T0, entry); });
    act(() => { h.click(T0 + 1500, stop); });
    act(() => { h.click(T0 + 1500, target); });
  }

  it('draws a long box from entry, stop and target taps, labelled with its reward-to-risk', () => {
    const { h, view } = mount();
    act(() => { fireEvent.click(button('Risk box')); });
    expect(button('Risk box').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/Risk box: tap your entry price/)).toBeTruthy();
    act(() => { h.click(T0, 100); });
    expect(status()).toBe('drawing');
    expect(screen.getByText(/Risk box: tap your stop/)).toBeTruthy();
    act(() => { h.click(T0 + 1500, 95); });
    expect(status()).toBe('preview');
    expect(screen.getByText(/Risk box: tap your target/)).toBeTruthy();
    act(() => { h.click(T0 + 1800, 110); });
    expect(status()).toBe('idle');
    expect(latest!.getRiskBoxes()).toEqual([expect.objectContaining({
      analysis: expect.objectContaining({ side: 'long', levels: { entry: '100', stop: '95', target: '110' } }),
      extent: { start: new Date(T0 * 1000).toISOString(), end: new Date((T0 + 1500) * 1000).toISOString() },
    })]);
    expect(latest!.getDrawings()).toEqual([]);
    expect(group().getAttribute('data-risk-box-count')).toBe('1');
    expect(screen.getByText(/0 lines · 1 risk box on this chart/)).toBeTruthy();
    const painted = h.paintLatest();
    expect(painted.labels).toEqual(['Long · Reward is 2× the risk']);
    expect(painted.strokes).toBe(3);
    view.unmount();
  });

  it('ignores a stop at the entry price and a target on the stop side', () => {
    const { h, view } = mount();
    act(() => { fireEvent.click(button('Risk box')); });
    act(() => { h.click(T0, 100); });
    act(() => { h.click(T0 + 1500, 100); });
    expect(status()).toBe('drawing');
    act(() => { h.click(T0 + 1500, 95); });
    expect(status()).toBe('preview');
    act(() => { h.click(T0 + 1500, 90); });
    expect(status()).toBe('preview');
    expect(latest!.getRiskBoxes()).toEqual([]);
    view.unmount();
  });

  it('makes a short box when the stop is above the entry', () => {
    const { h, view } = mount();
    drawBox(h, 100, 104, 92);
    expect(latest!.getRiskBoxes()[0].analysis).toMatchObject({ side: 'short', levels: { entry: '100', stop: '104', target: '92' } });
    expect(h.paintLatest().labels).toEqual(['Short · Reward is 2× the risk']);
    view.unmount();
  });

  it('selects a box by a tap inside it and deletes it, keeping lines and zones', () => {
    const { h, view } = mount();
    act(() => { fireEvent.click(button('Trend line')); });
    act(() => { h.click(T0 - 600, 50); });
    act(() => { h.click(T0 - 300, 60); });
    act(() => { fireEvent.click(button('Zone')); });
    act(() => { h.click(T0 - 600, 300); });
    act(() => { h.click(T0 - 300, 320); });
    drawBox(h, 100, 95, 110);
    expect(latest!.getRiskBoxes()).toHaveLength(1);
    act(() => { h.click(T0 + 700, 104, T0 + 700); });
    expect(status()).toBe('selected');
    expect(screen.getByText('Risk box selected: Long · Reward is 2× the risk. Delete removes it.', { exact: false })).toBeTruthy();
    act(() => { fireEvent.click(button('Delete risk box')); });
    expect(status()).toBe('idle');
    expect(latest!.getRiskBoxes()).toEqual([]);
    expect(latest!.getDrawings().map((drawing) => drawing.kind)).toEqual(['trend-line', 'zone']);
    expect(group().getAttribute('data-risk-box-count')).toBe('0');
    view.unmount();
  });

  it('loads boxes, and keeps them drawn when a line is deleted', () => {
    const { h, view } = mount();
    const d = (value: string) => value as DecimalString;
    const saved: SavedRiskRewardAnalysis = {
      analysis: { id: 'box-a', side: 'long', levels: { entry: d('100'), stop: d('90'), target: d('130') } },
      extent: { start: new Date(T0 * 1000).toISOString(), end: new Date((T0 + 900) * 1000).toISOString() },
    };
    act(() => { latest!.loadRiskBoxes([saved]); });
    expect(latest!.getRiskBoxes()).toEqual([saved]);
    expect(group().getAttribute('data-risk-box-count')).toBe('1');
    expect(h.paintLatest().labels).toEqual(['Long · Reward is 3× the risk']);
    act(() => { fireEvent.click(button('Trend line')); });
    act(() => { h.click(T0 - 600, 20); });
    act(() => { h.click(T0 - 300, 30); });
    const [line] = latest!.getDrawings();
    act(() => { h.click(T0 - 450, 25, T0 - 450); });
    expect(status()).toBe('selected');
    expect(latest!.selectedKind).toBe('trend-line');
    act(() => { fireEvent.click(button('Delete line')); });
    expect(latest!.getDrawings().find((drawing) => drawing.id === line.id)).toBeUndefined();
    expect(h.paintLatest().labels).toEqual(['Long · Reward is 3× the risk']);
    act(() => { latest!.loadRiskBoxes([]); });
    expect(latest!.getRiskBoxes()).toEqual([]);
    expect(h.paintLatest().labels).toEqual([]);
    view.unmount();
  });

  it('labels a box with only its side when the ratio is unavailable', () => {
    const d = (value: string) => value as DecimalString;
    expect(riskBoxLabel({ analysis: { id: 'x', side: 'long', levels: { entry: d('100'), stop: d('100'), target: d('110') } }, extent: { start: '', end: '' } })).toBe('Long');
    expect(riskBoxLabel({ analysis: { id: 'y', side: 'short', levels: { entry: d('100'), stop: d('103'), target: d('95') } }, extent: { start: '', end: '' } })).toBe('Short · Reward is 1.67× the risk');
  });
});
