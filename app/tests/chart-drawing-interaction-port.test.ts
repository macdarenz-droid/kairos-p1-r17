import { describe, expect, it, vi } from 'vitest';
import {
  createChartDrawingInteractionPort,
  type ChartDrawingInteractionState,
} from '../src/features/chart';

describe('P18.24 chart drawing interaction port', () => {
  it('owns one ephemeral current state and delegates transitions to the reducer', () => {
    const observed: ChartDrawingInteractionState[] = [];
    const session = createChartDrawingInteractionPort().create((state) => observed.push(state));

    expect(session.getState()).toEqual({ status: 'idle' });
    expect(session.dispatch({ type: 'select-tool', tool: 'trend-line' })).toEqual({
      status: 'tool-selected',
      tool: 'trend-line',
    });
    expect(session.dispatch({ type: 'start-drawing' })).toEqual({
      status: 'drawing',
      tool: 'trend-line',
    });
    expect(session.dispatch({ type: 'preview-drawing' })).toEqual({
      status: 'preview',
      tool: 'trend-line',
    });

    expect(observed).toEqual([
      { status: 'tool-selected', tool: 'trend-line' },
      { status: 'drawing', tool: 'trend-line' },
      { status: 'preview', tool: 'trend-line' },
    ]);
  });

  it('does not emit a second state owner for reducer no-op events', () => {
    const onStateChange = vi.fn();
    const session = createChartDrawingInteractionPort().create(onStateChange);

    const before = session.getState();
    const after = session.dispatch({ type: 'start-drawing' });

    expect(after).toBe(before);
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it('keeps separate sessions isolated', () => {
    const port = createChartDrawingInteractionPort();
    const first = port.create(() => undefined);
    const second = port.create(() => undefined);

    first.dispatch({ type: 'select-tool', tool: 'trend-line' });

    expect(first.getState()).toEqual({ status: 'tool-selected', tool: 'trend-line' });
    expect(second.getState()).toEqual({ status: 'idle' });
  });

  it('destroys idempotently and rejects use after destroy', () => {
    const session = createChartDrawingInteractionPort().create(() => undefined);

    session.destroy();
    session.destroy();

    expect(() => session.getState()).toThrow('chart-drawing-interaction-destroyed');
    expect(() => session.dispatch({ type: 'reset-interaction' })).toThrow(
      'chart-drawing-interaction-destroyed',
    );
  });
});
