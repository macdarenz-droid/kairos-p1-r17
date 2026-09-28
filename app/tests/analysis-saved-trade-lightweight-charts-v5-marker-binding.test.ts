import { describe, expect, it, vi } from 'vitest';
import type { ChartTheme } from '../src/design-system/themes/chartThemeAdapter';
import type { AnalysisSavedTradeExecutionMarkerProjection } from '../src/app/analysisSavedTradeExecutionMarkerProjection';
import {
  createAnalysisSavedTradeLightweightChartsV5MarkerBinding,
  type AnalysisSavedTradeMarkerSeries,
  type AnalysisSavedTradeSeriesMarkersFactory,
} from '../src/app/analysisSavedTradeLightweightChartsV5MarkerBinding';

const theme = {
  drawingPrimary: '#111111',
  drawingSecondary: '#eeeeee',
} as ChartTheme;

const ready: AnalysisSavedTradeExecutionMarkerProjection = {
  kind: 'markers-ready',
  historyObservedAt: '2026-09-14T00:03:00.000Z',
  historyInterval: '1m',
  markers: [
    {
      markerId: 'journal-execution:exit-2', role: 'exit', candleAnchorTime: '2026-09-14T00:02:00.000Z',
      candleCloseTime: '2026-09-14T00:02:59.999Z', candleIndex: 2, executionId: 'exit-2',
      executedAt: '2026-09-14T00:02:42.125Z', price: '110.25' as never, quantity: '1' as never,
    },
    {
      markerId: 'journal-execution:entry-1', role: 'entry', candleAnchorTime: '2026-09-14T00:00:00.000Z',
      candleCloseTime: '2026-09-14T00:00:59.999Z', candleIndex: 0, executionId: 'entry-1',
      executedAt: '2026-09-14T00:00:42.125Z', price: '0' as never, quantity: '2' as never,
    },
  ],
  unplacedExecutions: [{
    executionId: 'exit-gap', role: 'exit', executedAt: '2026-09-14T00:01:30.000Z',
    price: '105' as never, quantity: '1' as never, reason: 'not-covered',
  }],
};

function harness() {
  const setMarkers = vi.fn();
  const detach = vi.fn();
  const createMarkers = vi.fn<AnalysisSavedTradeSeriesMarkersFactory>(() => ({ setMarkers, detach }));
  const binding = createAnalysisSavedTradeLightweightChartsV5MarkerBinding(
    {} as AnalysisSavedTradeMarkerSeries,
    createMarkers,
  );
  return { binding, createMarkers, setMarkers, detach };
}

describe('Analysis saved-trade Lightweight Charts v5 marker binding', () => {
  it('sorts exact candle anchors for the provider while preserving zero as an exact marker price', () => {
    const { binding, createMarkers } = harness();
    const result = binding.present(ready, theme);

    expect(createMarkers).toHaveBeenCalledOnce();
    expect(createMarkers.mock.calls[0][1]).toEqual([
      { id: 'journal-execution:entry-1', time: 1789344000, price: 0, position: 'atPriceMiddle', shape: 'circle', color: '#111111', text: 'Entry' },
      { id: 'journal-execution:exit-2', time: 1789344120, price: 110.25, position: 'atPriceMiddle', shape: 'square', color: '#eeeeee', text: 'Exit' },
    ]);
    expect(result).toEqual({ kind: 'presented', markerCount: 2, unplacedExecutions: ready.unplacedExecutions });
    expect((result as { unplacedExecutions: unknown }).unplacedExecutions).toBe(ready.unplacedExecutions);
  });

  it('updates the same plugin for theme changes without creating a second marker owner', () => {
    const { binding, createMarkers, setMarkers } = harness();
    binding.present(ready, theme);
    binding.present(ready, { ...theme, drawingPrimary: '#abcdef' });
    expect(createMarkers).toHaveBeenCalledOnce();
    expect(setMarkers).toHaveBeenCalledOnce();
    expect(setMarkers.mock.calls[0][0][0]).toEqual(expect.objectContaining({ color: '#abcdef' }));
  });

  it('clears an existing plugin when exact projection evidence becomes unavailable', () => {
    const { binding, setMarkers } = harness();
    binding.present(ready, theme);
    expect(binding.present({ kind: 'unavailable', reason: 'history-scope-mismatch' }, theme)).toEqual({
      kind: 'unavailable', reason: 'history-scope-mismatch',
    });
    expect(setMarkers).toHaveBeenLastCalledWith([]);
  });

  it('does not create a provider resource when there are no placed markers', () => {
    const { binding, createMarkers } = harness();
    const result = binding.present({ ...ready, markers: [] }, theme);
    expect(result).toEqual({ kind: 'presented', markerCount: 0, unplacedExecutions: ready.unplacedExecutions });
    expect(createMarkers).not.toHaveBeenCalled();
  });

  it('fails closed before provider mutation for invalid exact time or decimal evidence', () => {
    const invalidTime = { ...ready, markers: [{ ...ready.markers[0], candleAnchorTime: 'not-a-time' }] };
    const invalidPrice = { ...ready, markers: [{ ...ready.markers[0], price: 'not-a-decimal' as never }] };
    const timeHarness = harness();
    const priceHarness = harness();
    expect(() => timeHarness.binding.present(invalidTime, theme)).toThrow('invalid-chart-timestamp');
    expect(() => priceHarness.binding.present(invalidPrice, theme)).toThrow('invalid-chart-decimal');
    expect(timeHarness.createMarkers).not.toHaveBeenCalled();
    expect(priceHarness.createMarkers).not.toHaveBeenCalled();
  });

  it('clears and detaches once on close and rejects later presentation', () => {
    const { binding, setMarkers, detach } = harness();
    binding.present(ready, theme);
    binding.close();
    binding.close();
    expect(setMarkers).toHaveBeenLastCalledWith([]);
    expect(detach).toHaveBeenCalledOnce();
    expect(() => binding.present(ready, theme)).toThrow('analysis-saved-trade-marker-binding-closed');
  });
});
