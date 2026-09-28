import { describe, expect, it } from 'vitest';
import {
  hitTestLightweightChartsV5TrendLineEditEndpoints,
  type LightweightChartsV5TrendLineScreenSegment,
} from '../src/features/chart';

const segment = (
  id: string,
  start = { x: 10, y: 10 },
  end = { x: 30, y: 10 },
): LightweightChartsV5TrendLineScreenSegment => ({
  id,
  kind: 'trend-line',
  start,
  end,
});

describe('P18.55 Lightweight Charts v5 trend-line edit endpoint hit-test geometry', () => {
  it('derives exact start and end endpoint evidence from projected trend-line geometry', () => {
    expect(hitTestLightweightChartsV5TrendLineEditEndpoints([segment('trend-55')], 11, 10, 2)).toEqual({
      id: 'trend-55',
      kind: 'trend-line-edit-endpoint',
      endpoint: 'start',
    });
    expect(hitTestLightweightChartsV5TrendLineEditEndpoints([segment('trend-55')], 29, 10, 2)).toEqual({
      id: 'trend-55',
      kind: 'trend-line-edit-endpoint',
      endpoint: 'end',
    });
  });

  it('chooses the nearer endpoint when both handles are within tolerance and fails closed on an exact tie', () => {
    const short = segment('short', { x: 10, y: 10 }, { x: 14, y: 10 });
    expect(hitTestLightweightChartsV5TrendLineEditEndpoints([short], 11, 10, 5)?.endpoint).toBe('start');
    expect(hitTestLightweightChartsV5TrendLineEditEndpoints([short], 13, 10, 5)?.endpoint).toBe('end');
    expect(hitTestLightweightChartsV5TrendLineEditEndpoints([short], 12, 10, 5)).toBeNull();
  });

  it('preserves the existing top-most/latest projected segment rule for overlapping endpoint geometry', () => {
    const lower = segment('lower');
    const upper = segment('upper');
    expect(hitTestLightweightChartsV5TrendLineEditEndpoints([lower, upper], 10, 10, 1)).toEqual({
      id: 'upper',
      kind: 'trend-line-edit-endpoint',
      endpoint: 'start',
    });
  });

  it('returns null outside endpoint tolerance without falling back to whole-segment hit semantics', () => {
    expect(hitTestLightweightChartsV5TrendLineEditEndpoints([segment('trend-55')], 20, 10, 3)).toBeNull();
  });

  it('reuses the existing P18.12 invalid-input failure contract', () => {
    expect(() => hitTestLightweightChartsV5TrendLineEditEndpoints([segment('trend-55')], 10, 10, -1))
      .toThrow('chart-drawing-hit-test-invalid-input');
  });
});
