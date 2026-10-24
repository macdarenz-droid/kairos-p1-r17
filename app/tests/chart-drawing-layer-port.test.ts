import { describe, expect, it, vi } from 'vitest';
import {
  createChartDrawingLayerPortFromDriver,
  type ChartDrawingLayerDriver,
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

const drawings: readonly RendererChartDrawing[] = [{
  id: 'drawing-1',
  kind: 'trend-line',
  start: { time: 1788393600, value: 100 },
  end: { time: 1788393900, value: 105.5 },
}];

describe('P18.3 chart drawing layer lifecycle port', () => {
  it('attaches through the injected provider-neutral driver and forwards projected drawings', () => {
    const replaceDrawings = vi.fn();
    const detach = vi.fn();
    const attach = vi.fn(() => ({ replaceDrawings, detach }));
    const driver: ChartDrawingLayerDriver = { attach };
    const target = seriesHandle();

    const session = createChartDrawingLayerPortFromDriver(driver).attach(target);
    session.replaceDrawings(drawings);

    expect(attach).toHaveBeenCalledWith(target);
    expect(replaceDrawings).toHaveBeenCalledWith(drawings);
  });

  it('detaches renderer-owned resources exactly once', () => {
    const detach = vi.fn();
    const driver: ChartDrawingLayerDriver = {
      attach: () => ({ replaceDrawings() {}, detach }),
    };

    const session = createChartDrawingLayerPortFromDriver(driver).attach(seriesHandle());
    session.destroy();
    session.destroy();

    expect(detach).toHaveBeenCalledTimes(1);
  });

  it('rejects drawing replacement after destruction', () => {
    const driver: ChartDrawingLayerDriver = {
      attach: () => ({ replaceDrawings() {}, detach() {} }),
    };

    const session = createChartDrawingLayerPortFromDriver(driver).attach(seriesHandle());
    session.destroy();

    expect(() => session.replaceDrawings(drawings)).toThrow('chart-drawing-layer-destroyed');
  });
});
