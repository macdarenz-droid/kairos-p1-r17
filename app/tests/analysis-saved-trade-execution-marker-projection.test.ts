import { describe, expect, it } from 'vitest';
import type { AnalysisSavedTradeCandleWindowProjection } from '../src/app/analysisSavedTradeCandleWindowProjection';
import { projectAnalysisSavedTradeExecutionMarkers } from '../src/app/analysisSavedTradeExecutionMarkerProjection';
import { parseDecimalString } from '../src/domain/trades';

function decimal(value: string) {
  const result = parseDecimalString(value);
  if (!result.ok) throw new Error('invalid decimal fixture');
  return result.value;
}

const window: AnalysisSavedTradeCandleWindowProjection = {
  kind: 'window-ready',
  historyObservedAt: '2026-09-14T00:03:00.000Z',
  historyInterval: '1m',
  executions: [
    {
      executionId: 'entry-1', executionType: 'entry', price: decimal('0'), quantity: decimal('2'),
      executedAt: '2026-09-14T00:00:42.125Z',
      placement: { kind: 'inside-candle', candleIndex: 0, candleOpenTime: '2026-09-14T00:00:00.000Z', candleCloseTime: '2026-09-14T00:00:59.999Z' },
    },
    {
      executionId: 'exit-gap', executionType: 'exit', price: decimal('110.25'), quantity: decimal('1'),
      executedAt: '2026-09-14T00:01:30.000Z', placement: { kind: 'outside-window', reason: 'not-covered' },
    },
  ],
};

describe('Analysis saved-trade execution-marker projection', () => {
  it('anchors a marker to the exact authoritative candle while preserving the exact execution instant and zero price', () => {
    const result = projectAnalysisSavedTradeExecutionMarkers(window);
    expect(result).toEqual({
      kind: 'markers-ready', historyObservedAt: '2026-09-14T00:03:00.000Z', historyInterval: '1m',
      markers: [{
        markerId: 'journal-execution:entry-1', role: 'entry', candleAnchorTime: '2026-09-14T00:00:00.000Z',
        candleCloseTime: '2026-09-14T00:00:59.999Z', candleIndex: 0, executionId: 'entry-1',
        executedAt: '2026-09-14T00:00:42.125Z', price: decimal('0'), quantity: decimal('2'),
      }],
      unplacedExecutions: [{
        executionId: 'exit-gap', role: 'exit', executedAt: '2026-09-14T00:01:30.000Z',
        price: decimal('110.25'), quantity: decimal('1'), reason: 'not-covered',
      }],
    });
  });

  it('keeps unplaced executions explicit instead of snapping them to the nearest marker anchor', () => {
    const result = projectAnalysisSavedTradeExecutionMarkers(window);
    if (result.kind !== 'markers-ready') throw new Error('expected markers-ready');
    expect(result.markers.map((marker) => marker.executionId)).toEqual(['entry-1']);
    expect(result.unplacedExecutions).toEqual([expect.objectContaining({ executionId: 'exit-gap', reason: 'not-covered' })]);
  });

  it('preserves unavailable Gate439 history evidence without manufacturing markers', () => {
    expect(projectAnalysisSavedTradeExecutionMarkers({
      kind: 'unavailable', reason: 'history-scope-mismatch', referenceReason: null,
    })).toEqual({ kind: 'unavailable', reason: 'history-scope-mismatch' });
  });

  it('rejects duplicate execution identities rather than creating ambiguous marker ids', () => {
    const duplicate: AnalysisSavedTradeCandleWindowProjection = {
      ...window,
      executions: [window.executions[0], { ...window.executions[0], executionType: 'exit' }],
    };
    expect(() => projectAnalysisSavedTradeExecutionMarkers(duplicate)).toThrow('analysis-saved-trade-execution-marker-id-duplicate');
  });

  it('freezes the projection, collections and every projected fact', () => {
    const result = projectAnalysisSavedTradeExecutionMarkers(window);
    if (result.kind !== 'markers-ready') throw new Error('expected markers-ready');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.markers)).toBe(true);
    expect(Object.isFrozen(result.markers[0])).toBe(true);
    expect(Object.isFrozen(result.unplacedExecutions)).toBe(true);
    expect(Object.isFrozen(result.unplacedExecutions[0])).toBe(true);
  });
});
