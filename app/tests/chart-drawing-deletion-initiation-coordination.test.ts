import { describe, expect, it, vi } from 'vitest';
import {
  createChartDrawingInteractionPort,
  initiateChartDrawingDeletionFromSelection,
  type ChartDrawingInteractionSession,
} from '../src/features/chart';

describe('P18.53 chart drawing deletion initiation coordination', () => {
  it('initiates deletion only from the exact authoritative selected drawing identity', () => {
    const onStateChange = vi.fn();
    const interaction = createChartDrawingInteractionPort().create(onStateChange);
    interaction.dispatch({ type: 'select-drawing', drawingId: 'drawing-53-selected' });

    expect(initiateChartDrawingDeletionFromSelection(interaction)).toEqual({
      status: 'deleting',
      drawingId: 'drawing-53-selected',
    });
    expect(interaction.getState()).toEqual({
      status: 'deleting',
      drawingId: 'drawing-53-selected',
    });
    expect(onStateChange).toHaveBeenLastCalledWith({
      status: 'deleting',
      drawingId: 'drawing-53-selected',
    });
  });

  it('does not initiate deletion from idle or other non-selected authoritative states', () => {
    const idle = createChartDrawingInteractionPort().create(vi.fn());
    expect(initiateChartDrawingDeletionFromSelection(idle)).toBeNull();
    expect(idle.getState()).toEqual({ status: 'idle' });

    const editing = createChartDrawingInteractionPort().create(vi.fn());
    editing.dispatch({ type: 'select-drawing', drawingId: 'drawing-53-editing' });
    editing.dispatch({
      type: 'start-editing',
      drawingId: 'drawing-53-editing',
      endpoint: 'start',
    });
    expect(initiateChartDrawingDeletionFromSelection(editing)).toBeNull();
    expect(editing.getState()).toEqual({
      status: 'editing',
      drawingId: 'drawing-53-editing',
      endpoint: 'start',
    });
  });

  it('never accepts caller-supplied drawing identity and forwards the selected id exactly once', () => {
    const getState = vi.fn(() => ({
      status: 'selected' as const,
      drawingId: 'drawing-53-authoritative',
    }));
    const dispatch = vi.fn(() => ({
      status: 'deleting' as const,
      drawingId: 'drawing-53-authoritative',
    }));

    expect(initiateChartDrawingDeletionFromSelection({ getState, dispatch })).toEqual({
      status: 'deleting',
      drawingId: 'drawing-53-authoritative',
    });
    expect(getState).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'start-deleting',
      drawingId: 'drawing-53-authoritative',
    });
  });

  it('fails closed when the active interaction owner rejects the delegated transition', () => {
    const interaction: Pick<ChartDrawingInteractionSession, 'getState' | 'dispatch'> = {
      getState: () => ({ status: 'selected', drawingId: 'drawing-53-rejected' }),
      dispatch: () => ({ status: 'selected', drawingId: 'drawing-53-rejected' }),
    };

    expect(initiateChartDrawingDeletionFromSelection(interaction)).toBeNull();
  });
});
