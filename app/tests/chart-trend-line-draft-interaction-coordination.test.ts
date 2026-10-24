import { describe, expect, it } from 'vitest';
import { parsePositiveDecimalString } from '../src/domain/trades';
import type { ChartDrawingAnchor } from '../src/features/chart';
import { createChartTrendLineDraftInteractionPort } from '../src/features/chart';

function decimal(value: string) {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid test decimal: ${value}`);
  return parsed.value;
}

const first: ChartDrawingAnchor = {
  timestamp: '2026-09-04T10:00:00.000Z',
  price: decimal('100.25'),
};
const second: ChartDrawingAnchor = {
  timestamp: '2026-09-04T10:01:00.000Z',
  price: decimal('101.75'),
};

function createSelectedTrendLineSession() {
  const observed: string[] = [];
  const session = createChartTrendLineDraftInteractionPort().create((state) => {
    observed.push(state.status);
  });
  session.dispatch({ type: 'select-tool', tool: 'trend-line' });
  return { session, observed };
}

describe('P18.29 chart trend-line draft interaction coordination', () => {
  it('routes the first valid anchor through P18.28 draft storage and P18.24 start-drawing dispatch', () => {
    const { session, observed } = createSelectedTrendLineSession();

    expect(session.acceptAnchor(first)).toEqual({ status: 'drawing', tool: 'trend-line' });
    expect(session.getAnchors()).toEqual([first]);
    expect(observed).toEqual(['tool-selected', 'drawing']);
  });

  it('routes the second valid anchor to preview without constructing committed drawing truth', () => {
    const { session, observed } = createSelectedTrendLineSession();
    session.acceptAnchor(first);

    expect(session.acceptAnchor(second)).toEqual({ status: 'preview', tool: 'trend-line' });
    expect(session.getAnchors()).toEqual([first, second]);
    expect(observed).toEqual(['tool-selected', 'drawing', 'preview']);
  });

  it('fails closed on null anchors and anchors outside the eligible trend-line interaction states', () => {
    const session = createChartTrendLineDraftInteractionPort().create(() => undefined);

    expect(session.acceptAnchor(null)).toEqual({ status: 'idle' });
    expect(session.acceptAnchor(first)).toEqual({ status: 'idle' });
    expect(session.getAnchors()).toEqual([]);

    session.dispatch({ type: 'select-tool', tool: 'trend-line' });
    expect(session.acceptAnchor(null)).toEqual({ status: 'tool-selected', tool: 'trend-line' });
    expect(session.getAnchors()).toEqual([]);
  });

  it('clears only ephemeral draft anchors after successful cancel and reset lifecycle transitions', () => {
    const { session } = createSelectedTrendLineSession();
    session.acceptAnchor(first);

    expect(session.dispatch({ type: 'cancel-interaction' })).toEqual({ status: 'cancelled' });
    expect(session.getAnchors()).toEqual([]);

    session.dispatch({ type: 'reset-interaction' });
    session.dispatch({ type: 'select-tool', tool: 'trend-line' });
    session.acceptAnchor(second);
    expect(session.getAnchors()).toEqual([second]);

    expect(session.dispatch({ type: 'reset-interaction' })).toEqual({ status: 'idle' });
    expect(session.getAnchors()).toEqual([]);
  });

  it('destroy is idempotent and later coordinated access fails closed', () => {
    const { session } = createSelectedTrendLineSession();
    session.acceptAnchor(first);

    session.destroy();
    session.destroy();

    expect(() => session.getState()).toThrow('chart-trend-line-draft-interaction-destroyed');
    expect(() => session.getAnchors()).toThrow('chart-trend-line-draft-interaction-destroyed');
    expect(() => session.acceptAnchor(second)).toThrow(
      'chart-trend-line-draft-interaction-destroyed',
    );
  });
});
