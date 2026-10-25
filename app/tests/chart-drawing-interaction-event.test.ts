import { describe, expect, it } from 'vitest';
import {
  defineChartDrawingInteractionEvent,
  type ChartDrawingInteractionEvent,
} from '../src/features/chart';

describe('P18.22 chart drawing interaction-event contract', () => {
  it('keeps tool selection as one explicit event with tool identity', () => {
    const event: ChartDrawingInteractionEvent = {
      type: 'select-tool',
      tool: 'trend-line',
    };

    expect(defineChartDrawingInteractionEvent(event)).toEqual(event);
  });

  it('keeps committed/edit/delete drawing identity explicit without mutating truth', () => {
    const commit: ChartDrawingInteractionEvent = {
      type: 'commit-drawing',
      drawingId: 'drawing-1',
    };
    const edit: ChartDrawingInteractionEvent = {
      type: 'start-editing',
      drawingId: 'drawing-2',
      endpoint: 'end',
    };
    const remove: ChartDrawingInteractionEvent = {
      type: 'start-deleting',
      drawingId: 'drawing-3',
    };

    expect(defineChartDrawingInteractionEvent(commit)).toEqual(commit);
    expect(defineChartDrawingInteractionEvent(edit)).toEqual(edit);
    expect(edit.endpoint).toBe('end');
    expect(defineChartDrawingInteractionEvent(remove)).toEqual(remove);
  });
});
