import { describe, expect, it } from 'vitest';
import {
  INITIAL_CHART_DRAWING_INTERACTION_STATE,
  defineChartDrawingInteractionState,
  type ChartDrawingInteractionState,
} from '../src/features/chart';

describe('P18.21 chart drawing interaction-state contract', () => {
  it('starts in one explicit idle state instead of unrelated booleans', () => {
    expect(INITIAL_CHART_DRAWING_INTERACTION_STATE).toEqual({ status: 'idle' });
  });

  it('preserves tool and drawing identity only on states that own them', () => {
    const selected: ChartDrawingInteractionState = {
      status: 'tool-selected',
      tool: 'trend-line',
    };
    const editing: ChartDrawingInteractionState = {
      status: 'editing',
      drawingId: 'drawing-1',
      endpoint: 'start',
    };

    expect(defineChartDrawingInteractionState(selected)).toEqual(selected);
    expect(defineChartDrawingInteractionState(editing)).toEqual(editing);
  });
});
