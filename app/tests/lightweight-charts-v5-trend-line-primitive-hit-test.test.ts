import { describe, expect, it, vi } from 'vitest';
import {
  createLightweightChartsV5TrendLinePrimitive,
  type RendererChartDrawing,
} from '../src/features/chart';

const drawing: RendererChartDrawing = {
  id: 'trend-1',
  kind: 'trend-line',
  start: { time: 10, value: 20 },
  end: { time: 30, value: 40 },
};

function attachIdentityScales(primitive: ReturnType<typeof createLightweightChartsV5TrendLinePrimitive>) {
  primitive.attached({
    chart: { timeScale: () => ({ timeToCoordinate: (time) => time }) },
    series: { priceToCoordinate: (price) => price },
    requestUpdate: vi.fn(),
  });
}

describe('P18.13 Lightweight Charts v5 trend-line primitive hit-test binding', () => {
  it('returns no provider hover item before projected presentation geometry exists', () => {
    const primitive = createLightweightChartsV5TrendLinePrimitive([drawing], { color: '#fff', lineWidth: 1 });
    attachIdentityScales(primitive);
    expect(primitive.hitTest(20, 30)).toBeNull();
  });

  it('adapts the P18.12 top-most geometry hit to the provider PrimitiveHoveredItem shape', () => {
    const primitive = createLightweightChartsV5TrendLinePrimitive([drawing], { color: '#fff', lineWidth: 1 });
    attachIdentityScales(primitive);
    primitive.updateAllViews();

    expect(primitive.hitTest(20, 30)).toEqual({
      externalId: 'trend-1',
      zOrder: 'normal',
      cursorStyle: 'pointer',
      hitTestPriority: 1,
      itemType: 'primitive',
    });
  });

  it('refreshes hit-test geometry from the same projected segment snapshot used by rendering', () => {
    let xOffset = 0;
    const primitive = createLightweightChartsV5TrendLinePrimitive([drawing], { color: '#fff', lineWidth: 1 });
    primitive.attached({
      chart: { timeScale: () => ({ timeToCoordinate: (time) => time + xOffset }) },
      series: { priceToCoordinate: (price) => price },
      requestUpdate: vi.fn(),
    });
    primitive.updateAllViews();
    expect(primitive.hitTest(20, 30)?.externalId).toBe('trend-1');

    xOffset = 100;
    primitive.updateAllViews();
    expect(primitive.hitTest(20, 30)).toBeNull();
    expect(primitive.hitTest(120, 30)?.externalId).toBe('trend-1');
  });

  it('clears provider hover geometry when detached', () => {
    const primitive = createLightweightChartsV5TrendLinePrimitive([drawing], { color: '#fff', lineWidth: 1 });
    attachIdentityScales(primitive);
    primitive.updateAllViews();
    primitive.detached();
    expect(primitive.hitTest(20, 30)).toBeNull();
  });
});
