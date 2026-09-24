import { describe, expect, it } from 'vitest';
import {
  projectLightweightChartsV5DrawingSelection,
  type RendererChartDrawing,
} from '../src/features/chart';

const drawings: readonly RendererChartDrawing[] = [
  {
    id: 'trend-1',
    kind: 'trend-line',
    start: { time: 10, value: 20 },
    end: { time: 30, value: 40 },
  },
  {
    id: 'trend-2',
    kind: 'trend-line',
    start: { time: 40, value: 50 },
    end: { time: 60, value: 70 },
  },
];

describe('P18.39 Lightweight Charts v5 drawing selection projection', () => {
  it('projects a current series-primitive drawing hit into neutral selection evidence', () => {
    expect(
      projectLightweightChartsV5DrawingSelection(drawings, {
        hoveredInfo: {
          sourceKind: 'series-primitive',
          objectKind: 'primitive',
          objectId: 'trend-2',
        },
      }),
    ).toEqual({ kind: 'drawing-selection', drawingId: 'trend-2' });
  });

  it('fails closed when hoveredInfo is absent or objectId is not a string', () => {
    expect(projectLightweightChartsV5DrawingSelection(drawings, {})).toBeNull();
    expect(
      projectLightweightChartsV5DrawingSelection(drawings, {
        hoveredInfo: {
          sourceKind: 'series-primitive',
          objectKind: 'primitive',
          objectId: 42,
        },
      }),
    ).toBeNull();
  });

  it('rejects provider hits that are not owned by a series primitive', () => {
    expect(
      projectLightweightChartsV5DrawingSelection(drawings, {
        hoveredInfo: {
          sourceKind: 'series',
          objectKind: 'series',
          objectId: 'trend-1',
        },
      }),
    ).toBeNull();
    expect(
      projectLightweightChartsV5DrawingSelection(drawings, {
        hoveredInfo: {
          sourceKind: 'pane-primitive',
          objectKind: 'primitive',
          objectId: 'trend-1',
        },
      }),
    ).toBeNull();
  });

  it('rejects non-primitive target kinds even when an id collides with a drawing id', () => {
    expect(
      projectLightweightChartsV5DrawingSelection(drawings, {
        hoveredInfo: {
          sourceKind: 'series-primitive',
          objectKind: 'series-marker',
          objectId: 'trend-1',
        },
      }),
    ).toBeNull();
  });

  it('uses the current drawing snapshot and rejects stale or unrelated ids', () => {
    expect(
      projectLightweightChartsV5DrawingSelection(drawings.slice(1), {
        hoveredInfo: {
          sourceKind: 'series-primitive',
          objectKind: 'primitive',
          objectId: 'trend-1',
        },
      }),
    ).toBeNull();
    expect(
      projectLightweightChartsV5DrawingSelection(drawings, {
        hoveredInfo: {
          sourceKind: 'series-primitive',
          objectKind: 'primitive',
          objectId: 'unrelated-provider-object',
        },
      }),
    ).toBeNull();
  });
});
