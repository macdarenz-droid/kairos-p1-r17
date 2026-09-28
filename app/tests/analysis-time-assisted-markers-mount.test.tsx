import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SeriesMarker, Time } from 'lightweight-charts';
import { createAnalysisDrawingToolsLiveSessionFactory, createAnalysisDrawingToolsOverlaySessionFactory } from '../src/app/analysisDrawingToolsComposition';
import { createAnalysisTimeAssistedMarkerBinding, type AnalysisTimeAssistedMarkerSeries } from '../src/app/analysisTimeAssistedMarkerBinding';
import { createAnalysisTimeAssistedMarkerSession } from '../src/app/analysisTimeAssistedMarkerSession';
import { AnalysisTimeAssistedSnapshotControls } from '../src/app/AnalysisTimeAssistedSnapshotControls';
import { useAnalysisTimeAssistedMarkers } from '../src/app/useAnalysisTimeAssistedMarkers';
import { getChartTheme } from '../src/design-system/themes';
import type { TimeAssistedTradeSnapshot } from '../src/application/market-reference';
import type { DecimalString } from '../src/domain/trades/tradeTypes';

const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const candle = (openTime: string) => ({ openTime, closeTime: new Date(Date.parse(openTime) + 59_999).toISOString(), open: '2100' as DecimalString, high: '2104' as DecimalString, low: '2099' as DecimalString, close: '2102' as DecimalString });
const range = (openTime: string) => ({ kind: 'candle-range' as const, isEstimate: true as const, source: 'market-reference' as const, method: 'containing-candle' as const, resolution: '1m' as const, instrument, requestedAt: openTime, requestedAtUtc: openTime, candle: candle(openTime), gapMs: 0, acquiredAt: '2026-09-17T12:00:00.000Z' });
const snapshot: TimeAssistedTradeSnapshot = { kind: 'snapshot', isEstimate: true, source: 'market-reference', instrument, side: 'long', opening: range('2026-09-10T02:13:00.000Z'), closing: range('2026-09-10T04:30:00.000Z'), durationMs: 8_220_000 };
const snap = { source: 'market-reference', timeZone: 'UTC', request: { instrument, interval: '5m', limit: 500 }, observedAt: '2026-09-15T01:15:00.000Z', candles: [{ openTime: '2026-09-15T01:00:00.000Z', closeTime: '2026-09-15T01:04:59.999Z', open: '100', high: '102', low: '99', close: '101' }] };

describe('P22.4 estimated markers through the chart paths', () => {
  it('carries the marker session lifecycle into the production renderer on the base live path and fans it out with the overlay lifecycle on the saved-trade path', () => {
    const drawing = { attach: vi.fn(), detach: vi.fn() };
    const markers = { attach: vi.fn(), detach: vi.fn() };
    const overlay = createAnalysisDrawingToolsOverlaySessionFactory(drawing, markers)();
    const renderer = overlay.rendererFactory.create(document.createElement('div'));
    renderer.setTheme(getChartTheme('ink'));
    renderer.render({ market: { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' }, series: { kind: 'candles', candles: snap.candles }, journalExecutions: [] } as never);
    expect(markers.attach).toHaveBeenCalledTimes(1);
    expect(drawing.attach).toHaveBeenCalledTimes(1);
    renderer.destroy();
    expect(markers.detach).toHaveBeenCalledTimes(1);
    overlay.close();
    const live = createAnalysisDrawingToolsLiveSessionFactory(drawing, markers)();
    live.replace({ container: document.createElement('div'), instrument, interval: '5m', themeId: 'ink' } as never);
    live.close();
  });

  it('keeps one marker session per selection, re-presents the latest snapshot when a series attaches and reports the state to the preview', () => {
    const calls: SeriesMarker<Time>[][] = [];
    const series = {} as AnalysisTimeAssistedMarkerSeries;
    const createSession = () => createAnalysisTimeAssistedMarkerSession(s => createAnalysisTimeAssistedMarkerBinding(s, (_s, m) => { calls.push(m); return { setMarkers(next) { calls.push(next); }, detach() { /* fake */ } }; }));
    let latest: ReturnType<typeof useAnalysisTimeAssistedMarkers> | null = null;
    function Harness({ selected }: { selected: boolean }) {
      const markers = useAnalysisTimeAssistedMarkers(selected ? 'binance-spot|ETHUSDT|5m|0' : null, createSession);
      latest = markers;
      return <AnalysisTimeAssistedSnapshotControls instrument={selected ? instrument : null} onSnapshot={markers.present} markers={markers.presentation} history={{ acquireHistory: async () => ({ ok: false, reason: 'transport-failed' }) }} />;
    }
    const view = render(<Harness selected={false} />);
    expect(latest!.presentation).toBeNull();
    view.rerender(<Harness selected />);
    act(() => { latest!.present(snapshot); });
    expect(latest!.presentation).toEqual({ kind: 'pending-series' });
    act(() => { latest!.lifecycle.attach(series); });
    expect(latest!.presentation).toEqual({ kind: 'presented', markerCount: 2, unplaced: [] });
    expect(calls.at(-1)!.map(m => m.id)).toEqual(['time-assisted:entry', 'time-assisted:exit']);
    act(() => { latest!.present(null); });
    expect(latest!.presentation).toEqual({ kind: 'cleared' });
    expect(calls.at(-1)).toEqual([]);
    act(() => { latest!.present(snapshot); });
    act(() => { latest!.lifecycle.detach(series); });
    expect(latest!.presentation).toEqual({ kind: 'pending-series' });
    act(() => { latest!.lifecycle.attach(series); });
    expect(latest!.presentation).toEqual({ kind: 'presented', markerCount: 2, unplaced: [] });
    // The preview reflects the marker state beside its estimates once it has a snapshot to show.
    expect(screen.getByRole('region', { name: 'Time-assisted snapshot' })).toBeTruthy();
    view.rerender(<Harness selected={false} />);
    expect(latest!.presentation).toBeNull();
    view.unmount();
  });
});
