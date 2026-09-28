import { describe, expect, it, vi } from 'vitest';
import {
  createLightweightChartsV5DrawingLayerDriver,
  type ChartEngineSeriesHandle,
  type RendererChartDrawing,
} from '../src/features/chart';

function seriesHandle(): ChartEngineSeriesHandle {
  return {
    setPriceLineData() {},
    setCandleData() {},
    updatePriceLine() {},
    updateCandle() {},
  };
}

const drawingA: readonly RendererChartDrawing[] = [{
  id: 'drawing-a',
  kind: 'trend-line',
  start: { time: 1788393600, value: 100 },
  end: { time: 1788393900, value: 105 },
}];

const drawingB: readonly RendererChartDrawing[] = [{
  id: 'drawing-b',
  kind: 'trend-line',
  start: { time: 1788394200, value: 106 },
  end: { time: 1788394500, value: 110 },
}];

describe('P18.4 Lightweight Charts v5 drawing layer driver', () => {
  it('resolves the provider series and attaches a primitive produced from projected drawings', () => {
    const attachPrimitive = vi.fn();
    const detachPrimitive = vi.fn();
    const vendorSeries = { attachPrimitive, detachPrimitive };
    const resolveSeries = vi.fn(() => vendorSeries);
    const primitive = { id: 'primitive-a' };
    const create = vi.fn(() => primitive);
    const target = seriesHandle();

    const handle = createLightweightChartsV5DrawingLayerDriver(resolveSeries, { create }).attach(target);
    handle.replaceDrawings(drawingA);

    expect(resolveSeries).toHaveBeenCalledWith(target);
    expect(create).toHaveBeenCalledWith(drawingA);
    expect(attachPrimitive).toHaveBeenCalledWith(primitive);
    expect(detachPrimitive).not.toHaveBeenCalled();
  });

  it('detaches the previous primitive before attaching a replacement', () => {
    const calls: string[] = [];
    const vendorSeries = {
      attachPrimitive(primitive: { id: string }) { calls.push(`attach:${primitive.id}`); },
      detachPrimitive(primitive: { id: string }) { calls.push(`detach:${primitive.id}`); },
    };
    let sequence = 0;
    const driver = createLightweightChartsV5DrawingLayerDriver(
      () => vendorSeries,
      { create: () => ({ id: `primitive-${++sequence}` }) },
    );

    const handle = driver.attach(seriesHandle());
    handle.replaceDrawings(drawingA);
    handle.replaceDrawings(drawingB);

    expect(calls).toEqual(['attach:primitive-1', 'detach:primitive-1', 'attach:primitive-2']);
  });

  it('detaches the active primitive exactly once when the layer is detached', () => {
    const attachPrimitive = vi.fn();
    const detachPrimitive = vi.fn();
    const primitive = { id: 'primitive-a' };
    const handle = createLightweightChartsV5DrawingLayerDriver(
      () => ({ attachPrimitive, detachPrimitive }),
      { create: () => primitive },
    ).attach(seriesHandle());

    handle.replaceDrawings(drawingA);
    handle.detach();
    handle.detach();

    expect(detachPrimitive).toHaveBeenCalledTimes(1);
    expect(detachPrimitive).toHaveBeenCalledWith(primitive);
  });

  it('rejects replacement after provider detach', () => {
    const handle = createLightweightChartsV5DrawingLayerDriver(
      () => ({ attachPrimitive() {}, detachPrimitive() {} }),
      { create: () => ({}) },
    ).attach(seriesHandle());

    handle.detach();

    expect(() => handle.replaceDrawings(drawingA)).toThrow('lightweight-charts-drawing-layer-detached');
  });
});
