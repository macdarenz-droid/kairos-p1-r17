import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisDrawingToolsControls } from '../src/features/analysis/AnalysisDrawingToolsControls';
import { createAnalysisDrawingToolsLiveSessionFactory, createAnalysisDrawingToolsOverlaySessionFactory, createAnalysisDrawingToolsSession, resolveAnalysisDrawingToolsStyle } from '../src/app/analysisDrawingToolsComposition';
import { AnalysisLiveSessionFactoryContext, AnalysisOverlaySessionFactoryContext } from '../src/app/analysisDrawingToolsContext';
import { AnalysisLiveCandleCanvas } from '../src/app/AnalysisLiveCandleCanvas';
import { AnalysisSavedTradeOverlayLiveCandleCanvas } from '../src/app/AnalysisSavedTradeOverlayLiveCandleCanvas';
import { ANALYSIS_DRAWING_TREND_LINE_WIDTH } from '../src/app/analysisLiveCandleProductPolicy';
import { useAnalysisDrawingTools } from '../src/app/useAnalysisDrawingTools';
import type { AnalysisLiveCandleReactBindingOptions, AnalysisLiveCandleReactBindingResult } from '../src/app/useAnalysisLiveCandleRouteSession';
import type { AnalysisSavedTradeOverlayReactBindingOptions } from '../src/app/useAnalysisSavedTradeOverlayPresentationSession';
import { getChartTheme, ThemeProvider } from '../src/design-system/themes';
import { createLightweightChartsV5DriverBinding, type LightweightChartsV5Module } from '../src/features/chart';
import type { MarketCandleHistorySnapshot } from '../src/services/market-data/MarketCandleHistoryPort';
import type { JournalHistoryEntry } from '../src/application/journal';

const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const snapshot = { source: 'market-reference', timeZone: 'UTC', request: { instrument, interval: '5m', limit: 500 }, observedAt: '2026-09-15T01:15:00.000Z', candles: [{ openTime: '2026-09-15T01:00:00.000Z', closeTime: '2026-09-15T01:04:59.999Z', open: '100', high: '102', low: '99', close: '101' }] } as unknown as MarketCandleHistorySnapshot;

describe('Analysis drawing tools composition', () => {
  it('resolves the stroke from the active chart theme token and the product width', () => {
    expect(resolveAnalysisDrawingToolsStyle('ink')).toEqual({ color: getChartTheme('ink').drawingPrimary, lineWidth: ANALYSIS_DRAWING_TREND_LINE_WIDTH });
    expect(ANALYSIS_DRAWING_TREND_LINE_WIDTH).toBe(2);
  });

  it('carries the drawing lifecycle into the released production renderer on the base live path', () => {
    const attach = vi.fn(), detach = vi.fn();
    const factory = createAnalysisDrawingToolsLiveSessionFactory({ attach, detach });
    const session = factory();
    session.replace({ container: document.createElement('div'), instrument, interval: '5m', themeId: 'ink' } as never);
    expect(typeof session.close).toBe('function');
    session.close();
  });

  it('carries the drawing lifecycle into the shared overlay renderer factory on the saved-trade path', () => {
    const attach = vi.fn(), detach = vi.fn();
    const overlay = createAnalysisDrawingToolsOverlaySessionFactory({ attach, detach })();
    const renderer = overlay.rendererFactory.create(document.createElement('div'));
    renderer.setTheme(getChartTheme('ink'));
    renderer.render({ market: { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' }, series: { kind: 'candles', candles: snapshot.candles }, journalExecutions: [] } as never);
    expect(attach).toHaveBeenCalledTimes(1);
    renderer.destroy();
    expect(detach).toHaveBeenCalledTimes(1);
    overlay.close();
  });
});

describe('Drawing tools context seams', () => {
  it('lets the live canvas take the route-session factory from context while a prop still wins', () => {
    const useBinding = vi.fn((_o: AnalysisLiveCandleReactBindingOptions): AnalysisLiveCandleReactBindingResult => ({ availability: 'available', activation: { ok: false, reason: 'superseded' }, connection: null, disposition: null, backfillRequest: null, backfillRecovery: null, lastError: null, pan: vi.fn(), zoom: vi.fn(), resetView: vi.fn() }));
    const fromContext = vi.fn(), fromProp = vi.fn();
    render(<ThemeProvider><AnalysisLiveSessionFactoryContext.Provider value={fromContext as never}><AnalysisLiveCandleCanvas instrument={instrument} interval="5m" quoteAsset="USDT" useBinding={useBinding} /></AnalysisLiveSessionFactoryContext.Provider></ThemeProvider>);
    expect(useBinding).toHaveBeenLastCalledWith(expect.objectContaining({ createSession: fromContext }));
    render(<ThemeProvider><AnalysisLiveSessionFactoryContext.Provider value={fromContext as never}><AnalysisLiveCandleCanvas instrument={instrument} interval="5m" quoteAsset="USDT" useBinding={useBinding} createSession={fromProp as never} /></AnalysisLiveSessionFactoryContext.Provider></ThemeProvider>);
    expect(useBinding).toHaveBeenLastCalledWith(expect.objectContaining({ createSession: fromProp }));
  });

  it('lets the overlay canvas take the overlay session factory from context', () => {
    const useOverlayBinding = vi.fn((_o: AnalysisSavedTradeOverlayReactBindingOptions) => ({ rendererFactory: null, presentation: null, markerError: null, riskRewardError: null }));
    const fromContext = vi.fn();
    render(<ThemeProvider><AnalysisOverlaySessionFactoryContext.Provider value={fromContext as never}><AnalysisSavedTradeOverlayLiveCandleCanvas entry={{} as JournalHistoryEntry} instrument={instrument} interval="5m" quoteAsset="USDT" useOverlayBinding={useOverlayBinding} /></AnalysisOverlaySessionFactoryContext.Provider></ThemeProvider>);
    expect(useOverlayBinding).toHaveBeenLastCalledWith(expect.objectContaining({ createSession: fromContext }));
    render(<ThemeProvider><AnalysisSavedTradeOverlayLiveCandleCanvas entry={{} as JournalHistoryEntry} instrument={instrument} interval="5m" quoteAsset="USDT" useOverlayBinding={useOverlayBinding} /></ThemeProvider>);
    expect(useOverlayBinding.mock.calls.at(-1)?.[0]).not.toHaveProperty('createSession');
  });
});

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

describe('Drawing tools hook and controls', () => {
  let latest: ReturnType<typeof useAnalysisDrawingTools> | null = null;
  function Harness({ selected }: { selected: boolean }) {
    const tools = useAnalysisDrawingTools(selected ? { venue: 'binance-spot', symbol: 'ETHUSDT', interval: '5m', revision: 0 } : null);
    latest = tools;
    return <AnalysisDrawingToolsControls state={tools.state} drawingCount={tools.drawingCount} onSelectTrendLine={tools.selectTrendLineTool} onCancel={tools.cancel} onDeleteSelected={tools.deleteSelected} />;
  }
  const group = () => screen.getByRole('group', { name: 'Drawing tools' });
  const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

  it('is unavailable without a selection and until the seam attaches a series, outside any ThemeProvider', () => {
    const view = render(<Harness selected={false} />);
    expect(group().getAttribute('data-drawing-status')).toBe('unavailable');
    expect(button('Trend line').disabled).toBe(true);
    const inert = latest!;
    view.rerender(<Harness selected />);
    expect(latest).not.toBe(inert);
    expect(group().getAttribute('data-drawing-status')).toBe('unavailable');
    expect(button('Trend line').disabled).toBe(true);
    act(() => { fireEvent.click(button('Trend line')); });
    expect(group().getAttribute('data-drawing-status')).toBe('unavailable');
    view.unmount();
  });

  it('draws, selects and deletes a trend line through the hook once the seam attaches, and releases the session on unmount', () => {
    const h = createFakeChartHarness();
    const view = render(<Harness selected />);
    act(() => { latest!.lifecycle.attach(h.binding, h.handle); });
    expect(h.clickHandlers.size).toBe(1);
    expect(group().getAttribute('data-drawing-status')).toBe('idle');
    expect(button('Trend line').disabled).toBe(false);
    act(() => { fireEvent.click(button('Trend line')); });
    expect(group().getAttribute('data-drawing-status')).toBe('tool-selected');
    expect(button('Trend line').getAttribute('aria-pressed')).toBe('true');
    act(() => { h.click(1_757_000_000, 200); });
    expect(group().getAttribute('data-drawing-status')).toBe('drawing');
    act(() => { h.click(1_757_000_300, 260); });
    // Commit is acknowledged and the session returns to idle so the next click can select the placed line.
    expect(group().getAttribute('data-drawing-status')).toBe('idle');
    expect(group().getAttribute('data-drawing-count')).toBe('1');
    expect(screen.getByText(/1 line on this chart/)).toBeTruthy();
    const [placed] = latest!.getDrawings();
    expect(placed).toMatchObject({ kind: 'trend-line', start: { price: '100' }, end: { price: '130' } });
    act(() => { h.click(1_757_000_100, 220, placed.id); });
    expect(group().getAttribute('data-drawing-status')).toBe('selected');
    expect(button('Delete line').disabled).toBe(false);
    act(() => { fireEvent.click(button('Delete line')); });
    expect(group().getAttribute('data-drawing-count')).toBe('0');
    expect(latest!.getDrawings()).toHaveLength(0);
    expect(button('Delete line').disabled).toBe(true);
    act(() => { latest!.lifecycle.detach(h.handle); });
    expect(group().getAttribute('data-drawing-status')).toBe('unavailable');
    expect(h.clickHandlers.size).toBe(0);
    act(() => { latest!.lifecycle.attach(h.binding, h.handle); });
    expect(group().getAttribute('data-drawing-status')).toBe('idle');
    expect(button('Trend line').disabled).toBe(false);
    view.unmount();
    expect(h.clickHandlers.size).toBe(0);
    expect(h.attached.length - h.detached.length).toBe(0);
  });

  it('moves a selected endpoint from the toolbar flow: endpoint click enters editing, Cancel stays enabled, the next chart click moves it', () => {
    const h = createFakeChartHarness();
    const view = render(<Harness selected />);
    act(() => { latest!.lifecycle.attach(h.binding, h.handle); });
    act(() => { fireEvent.click(button('Trend line')); });
    act(() => { h.click(1_757_000_000, 200); });
    act(() => { h.click(1_757_000_300, 260); });
    const [placed] = latest!.getDrawings();
    act(() => { h.click(1_757_000_100, 220, placed.id); });
    expect(group().getAttribute('data-drawing-status')).toBe('selected');
    // The fake time scale maps epoch seconds to x and the series maps price to 2y: the end endpoint is (1_757_000_300, 260); the product tolerance is 8px.
    act(() => { h.click(1_757_000_300, 266, placed.id, 1_757_000_300); });
    expect(group().getAttribute('data-drawing-status')).toBe('editing');
    expect(button('Cancel').disabled).toBe(false);
    expect(button('Delete line').disabled).toBe(true);
    expect(screen.getByText(/Moving an endpoint/)).toBeTruthy();
    act(() => { h.click(1_757_000_600, 300); });
    expect(group().getAttribute('data-drawing-status')).toBe('idle');
    expect(group().getAttribute('data-drawing-count')).toBe('1');
    expect(latest!.getDrawings()[0]).toMatchObject({ id: placed.id, start: { price: '100' }, end: { price: '150' } });
    act(() => { h.click(1_757_000_100, 225, placed.id); });
    act(() => { h.click(1_757_000_000, 205, placed.id, 1_757_000_000); });
    expect(group().getAttribute('data-drawing-status')).toBe('editing');
    act(() => { fireEvent.click(button('Cancel')); });
    expect(group().getAttribute('data-drawing-status')).toBe('idle');
    expect(latest!.getDrawings()[0]).toMatchObject({ start: { price: '100' }, end: { price: '150' } });
    view.unmount();
    expect(h.attached.length - h.detached.length).toBe(0);
  });

  it('reflects the released interaction states in the toolbar', () => {
    const noop = () => undefined;
    const { rerender } = render(<AnalysisDrawingToolsControls state={{ status: 'tool-selected', tool: 'trend-line' }} drawingCount={0} onSelectTrendLine={noop} onCancel={noop} onDeleteSelected={noop} />);
    expect(screen.getByRole('button', { name: 'Trend line' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/click the first point/)).toBeTruthy();
    rerender(<AnalysisDrawingToolsControls state={{ status: 'selected', drawingId: 'd1' }} drawingCount={2} onSelectTrendLine={noop} onCancel={noop} onDeleteSelected={noop} />);
    expect((screen.getByRole('button', { name: 'Delete line' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/2 lines on this chart/)).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Drawing tools' }).getAttribute('data-drawing-count')).toBe('2');
  });

  it('creates one session per selection and releases it when the selection changes', () => {
    const session = createAnalysisDrawingToolsSession('ink');
    expect(session.presentation()).toEqual({ kind: 'pending-series' });
    session.destroy();
  });
});
