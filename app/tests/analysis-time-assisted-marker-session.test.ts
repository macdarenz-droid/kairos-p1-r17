import { describe, expect, it, vi } from 'vitest';
import type { SeriesMarker, Time } from 'lightweight-charts';
import { createAnalysisTimeAssistedMarkerBinding, projectAnalysisTimeAssistedMarkers, type AnalysisTimeAssistedMarkerSeries } from '../src/app/analysisTimeAssistedMarkerBinding';
import { composeCandlestickSeriesLifecycles, createAnalysisTimeAssistedMarkerSession } from '../src/app/analysisTimeAssistedMarkerSession';
import { getChartTheme } from '../src/design-system/themes';
import type { TimeAssistedTradeSnapshot } from '../src/application/market-reference';
import type { DecimalString } from '../src/domain/trades/tradeTypes';

const theme = getChartTheme('ink');
const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const candle = (openTime: string) => ({ openTime, closeTime: new Date(Date.parse(openTime) + 59_999).toISOString(), open: '2100' as DecimalString, high: '2104' as DecimalString, low: '2099' as DecimalString, close: '2102' as DecimalString });
const range = (openTime: string, gapMs: number) => ({ kind: 'candle-range' as const, isEstimate: true as const, source: 'market-reference' as const, method: 'containing-candle' as const, resolution: '1m' as const, instrument, requestedAt: openTime, requestedAtUtc: openTime, candle: candle(openTime), gapMs, acquiredAt: '2026-09-17T12:00:00.000Z' });
const snapshot = (side: 'long' | 'short', closing: TimeAssistedTradeSnapshot['closing']): TimeAssistedTradeSnapshot => ({ kind: 'snapshot', isEstimate: true, source: 'market-reference', instrument, side, opening: range('2026-09-10T02:13:00.000Z', 27_000), closing, durationMs: closing === null ? null : 8_220_000 });
function fakeSeries() {
  const calls: SeriesMarker<Time>[][] = []; let detached = 0;
  const series = {} as AnalysisTimeAssistedMarkerSeries;
  const factory = vi.fn((_s: AnalysisTimeAssistedMarkerSeries, markers: SeriesMarker<Time>[]) => { calls.push(markers); return { setMarkers(next: SeriesMarker<Time>[]) { calls.push(next); }, detach() { detached += 1; } }; });
  return { series, factory, calls, detached: () => detached };
}

describe('P22.4 time-assisted estimate markers', () => {
  it('projects an entry and exit marker on the containing candles, above or below the bar by side, labelled as estimates and without a price', () => {
    const long = projectAnalysisTimeAssistedMarkers(snapshot('long', range('2026-09-10T04:30:00.000Z', 0)), theme);
    expect(long.unplaced).toEqual([]);
    expect(long.markers).toEqual([
      { id: 'time-assisted:entry', time: Math.floor(Date.parse('2026-09-10T02:13:00.000Z') / 1000), position: 'belowBar', shape: 'arrowUp', color: theme.drawingPrimary, text: 'Est. entry' },
      { id: 'time-assisted:exit', time: Math.floor(Date.parse('2026-09-10T04:30:00.000Z') / 1000), position: 'aboveBar', shape: 'arrowDown', color: theme.drawingSecondary, text: 'Est. exit' },
    ]);
    expect(long.markers.every(marker => !('price' in marker))).toBe(true);
    const short = projectAnalysisTimeAssistedMarkers(snapshot('short', { kind: 'unavailable', instrument, requestedAt: 'x', reason: 'no-candle' }), theme);
    expect(short.markers).toMatchObject([{ id: 'time-assisted:entry', position: 'aboveBar', shape: 'arrowDown' }]);
    expect(short.unplaced).toEqual(['exit']);
  });

  it('creates the vendor markers plugin lazily, replaces markers on later snapshots, clears on null and detaches on close', () => {
    const f = fakeSeries();
    const binding = createAnalysisTimeAssistedMarkerBinding(f.series, f.factory);
    expect(binding.present(null, theme)).toEqual({ kind: 'cleared' });
    expect(f.factory).not.toHaveBeenCalled();
    expect(binding.present(snapshot('long', null), theme)).toEqual({ kind: 'presented', markerCount: 1, unplaced: [] });
    expect(binding.present(snapshot('long', range('2026-09-10T04:30:00.000Z', 0)), theme)).toEqual({ kind: 'presented', markerCount: 2, unplaced: [] });
    expect(f.factory).toHaveBeenCalledTimes(1);
    expect(f.calls.map(c => c.length)).toEqual([1, 2]);
    expect(binding.present(null, theme)).toEqual({ kind: 'cleared' });
    expect(f.calls.at(-1)).toEqual([]);
    binding.close();
    expect(f.detached()).toBe(1);
    expect(() => binding.present(null, theme)).toThrow('analysis-time-assisted-marker-binding-closed');
  });

  it('keeps the latest snapshot across series attach/detach and fans one lifecycle out to several owners', () => {
    const f = fakeSeries();
    const session = createAnalysisTimeAssistedMarkerSession(series => createAnalysisTimeAssistedMarkerBinding(series, f.factory));
    expect(session.presentation()).toBeNull();
    expect(session.present(snapshot('long', null), theme)).toEqual({ kind: 'pending-series' });
    const other = { attach: vi.fn(), detach: vi.fn() };
    const fanned = composeCandlestickSeriesLifecycles(other, session.lifecycle);
    fanned.attach(f.series);
    expect(other.attach).toHaveBeenCalledWith(f.series);
    expect(session.presentation()).toEqual({ kind: 'presented', markerCount: 1, unplaced: [] });
    expect(() => session.lifecycle.attach(f.series)).toThrow('analysis-time-assisted-marker-series-already-active');
    expect(() => session.lifecycle.detach({} as never)).toThrow('analysis-time-assisted-marker-series-mismatch');
    fanned.detach(f.series);
    expect(other.detach).toHaveBeenCalledWith(f.series);
    expect(session.presentation()).toEqual({ kind: 'pending-series' });
    expect(f.detached()).toBe(1);
    const g = fakeSeries();
    const again = createAnalysisTimeAssistedMarkerSession(series => createAnalysisTimeAssistedMarkerBinding(series, g.factory));
    again.lifecycle.attach(g.series);
    expect(again.present(snapshot('short', range('2026-09-10T04:30:00.000Z', 0)), theme)).toEqual({ kind: 'presented', markerCount: 2, unplaced: [] });
    again.close();
    expect(again.presentation()).toBeNull();
    expect(() => again.present(null, theme)).toThrow('analysis-time-assisted-marker-session-closed');
    expect(() => again.lifecycle.attach(g.series)).toThrow('analysis-time-assisted-marker-session-closed');
  });
});
