import { describe, expect, it, vi } from 'vitest';
import { parsePositiveDecimalString } from '../src/domain/trades';
import type {
  ChartDrawingAnchor,
  ChartTrendLineDraftInteractionSession,
} from '../src/features/chart';
import {
  commitChartTrendLineDraft,
  createChartTrendLineDraftInteractionPort,
} from '../src/features/chart';

function decimal(value: string) {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid test decimal: ${value}`);
  return parsed.value;
}

const first: ChartDrawingAnchor = {
  timestamp: '2026-09-05T01:00:00.000Z',
  price: decimal('100.25'),
};
const second: ChartDrawingAnchor = {
  timestamp: '2026-09-05T01:01:00.000Z',
  price: decimal('101.75'),
};

function createPreviewSession() {
  const observed: string[] = [];
  const session = createChartTrendLineDraftInteractionPort().create((state) => {
    observed.push(state.status);
  });
  session.dispatch({ type: 'select-tool', tool: 'trend-line' });
  session.acceptAnchor(first);
  session.acceptAnchor(second);
  return { session, observed };
}

describe('P18.32 chart trend-line draft commit coordination', () => {
  it('constructs through P18.31 then commits through the existing P18.29 interaction session', () => {
    const { session, observed } = createPreviewSession();

    expect(commitChartTrendLineDraft(session, 'drawing-32')).toEqual({
      id: 'drawing-32',
      kind: 'trend-line',
      start: first,
      end: second,
    });
    expect(session.getState()).toEqual({ status: 'committed', drawingId: 'drawing-32' });
    expect(session.getAnchors()).toEqual([]);
    expect(observed).toEqual(['tool-selected', 'drawing', 'preview', 'committed']);
  });

  it('fails closed outside trend-line preview without constructing or dispatching commit truth', () => {
    const session = createChartTrendLineDraftInteractionPort().create(() => undefined);
    session.dispatch({ type: 'select-tool', tool: 'trend-line' });
    session.acceptAnchor(first);

    expect(commitChartTrendLineDraft(session, 'too-early')).toBeNull();
    expect(session.getState()).toEqual({ status: 'drawing', tool: 'trend-line' });
    expect(session.getAnchors()).toEqual([first]);
  });

  it('preserves caller-supplied drawing identity across construction and authoritative commit state', () => {
    const { session } = createPreviewSession();

    const drawing = commitChartTrendLineDraft(session, 'caller-owned-32');

    expect(drawing?.id).toBe('caller-owned-32');
    expect(session.getState()).toEqual({ status: 'committed', drawingId: 'caller-owned-32' });
  });

  it('fails closed if the supplied authoritative session refuses the commit transition', () => {
    const dispatch = vi.fn(() => ({ status: 'preview', tool: 'trend-line' }) as const);
    const session: ChartTrendLineDraftInteractionSession = {
      getState: () => ({ status: 'preview', tool: 'trend-line' }),
      getAnchors: () => [first, second],
      dispatch,
      acceptAnchor: () => ({ status: 'preview', tool: 'trend-line' }),
      destroy: () => undefined,
    };

    expect(commitChartTrendLineDraft(session, 'rejected-32')).toBeNull();
    expect(dispatch).toHaveBeenCalledWith({ type: 'commit-drawing', drawingId: 'rejected-32' });
  });
});
