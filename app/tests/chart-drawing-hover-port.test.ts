import { describe, expect, it, vi } from 'vitest';
import type { ChartEngineSeriesHandle } from '../src/features/chart/chartEngineDriver';
import type { RendererChartDrawing } from '../src/features/chart/chartDrawingProjection';
import {
  createChartDrawingHoverPortFromDriver,
  type ChartDrawingHoverObservation,
  type ChartDrawingHoverDriver,
} from '../src/features/chart/chartDrawingHoverPort';

const series = {} as ChartEngineSeriesHandle;
const drawings: readonly RendererChartDrawing[] = [];

describe('P18.18 chart drawing hover lifecycle port', () => {
  it('delegates neutral attachment inputs and emits provider-neutral hover observations', () => {
    const detach = vi.fn();
    const captured: {
      listener: ((hover: ChartDrawingHoverObservation | null) => void) | null;
    } = { listener: null };

    const driver: ChartDrawingHoverDriver = {
      attach(attachedSeries, attachedDrawings, onHover) {
        expect(attachedSeries).toBe(series);
        expect(attachedDrawings).toBe(drawings);
        captured.listener = onHover;
        return { detach };
      },
    };

    const onHover = vi.fn();
    const session = createChartDrawingHoverPortFromDriver(driver).attach(series, drawings, onHover);
    const listener = captured.listener;
    expect(listener).not.toBeNull();
    if (listener === null) throw new Error('hover-listener-not-attached');

    listener({ kind: 'drawing-hover', drawingId: 'drawing-1' });
    listener(null);

    expect(onHover).toHaveBeenNthCalledWith(1, { kind: 'drawing-hover', drawingId: 'drawing-1' });
    expect(onHover).toHaveBeenNthCalledWith(2, null);

    session.destroy();
    session.destroy();
    expect(detach).toHaveBeenCalledTimes(1);
  });
});
