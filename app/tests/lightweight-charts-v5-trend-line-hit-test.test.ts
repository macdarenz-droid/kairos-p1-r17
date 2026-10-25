import { describe, expect, it } from 'vitest';
import { hitTestLightweightChartsV5TrendLineSegments, type LightweightChartsV5TrendLineScreenSegment } from '../src/features/chart';

const segment = (id: string, y = 10): LightweightChartsV5TrendLineScreenSegment => ({
  id, kind: 'trend-line', start: { x: 10, y }, end: { x: 30, y },
});

describe('P18.12 Lightweight Charts v5 trend-line hit-test geometry', () => {
  it('hits a projected segment within the supplied presentation tolerance', () => {
    expect(hitTestLightweightChartsV5TrendLineSegments([segment('a')], 20, 12, 2)).toEqual({ id: 'a', kind: 'trend-line', cursorStyle: 'pointer' });
  });
  it('returns null outside tolerance and clamps distance to segment endpoints', () => {
    expect(hitTestLightweightChartsV5TrendLineSegments([segment('a')], 35, 10, 4)).toBeNull();
    expect(hitTestLightweightChartsV5TrendLineSegments([segment('a')], 33, 10, 3)?.id).toBe('a');
  });
  it('returns the top-most/latest segment when projected geometry overlaps', () => {
    expect(hitTestLightweightChartsV5TrendLineSegments([segment('lower'), segment('upper')], 20, 10, 1)?.id).toBe('upper');
  });
  it('fails closed for invalid geometry inputs', () => {
    expect(() => hitTestLightweightChartsV5TrendLineSegments([segment('a')], 20, 10, -1)).toThrow('chart-drawing-hit-test-invalid-input');
  });
});
