import { describe, expect, it } from 'vitest';
import {
  projectChartDrawingSelectionPresentation,
  type ChartDrawingInteractionState,
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

describe('P18.43 chart drawing selection presentation projection', () => {
  it('projects authoritative selected state onto the exact current renderer drawing', () => {
    expect(
      projectChartDrawingSelectionPresentation(drawings, {
        status: 'selected',
        drawingId: 'trend-2',
      }),
    ).toEqual({
      drawing: drawings[1],
      mode: 'selected',
    });
  });

  it('preserves editing and deleting presentation modes without taking transition ownership', () => {
    const states: readonly ChartDrawingInteractionState[] = [
      { status: 'editing', drawingId: 'trend-1', endpoint: 'start' },
      { status: 'deleting', drawingId: 'trend-1' },
    ];

    for (const state of states) {
      expect(projectChartDrawingSelectionPresentation(drawings, state)).toEqual({
        drawing: drawings[0],
        mode: state.status,
      });
    }
  });

  it('fails stale selected identity closed against the current renderer snapshot', () => {
    expect(
      projectChartDrawingSelectionPresentation(drawings, {
        status: 'selected',
        drawingId: 'removed-drawing',
      }),
    ).toBeNull();
  });

  it('does not present non-selection interaction states', () => {
    const states: readonly ChartDrawingInteractionState[] = [
      { status: 'idle' },
      { status: 'tool-selected', tool: 'trend-line' },
      { status: 'drawing', tool: 'trend-line' },
      { status: 'preview', tool: 'trend-line' },
      { status: 'committed', drawingId: 'trend-1' },
      { status: 'cancelled' },
    ];

    for (const state of states) {
      expect(projectChartDrawingSelectionPresentation(drawings, state)).toBeNull();
    }
  });
});
