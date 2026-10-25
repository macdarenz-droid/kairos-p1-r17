import { describe, expect, it } from 'vitest';
import { parsePositiveDecimalString } from '../src/domain/trades';
import type { ChartDrawingAnchor, ChartTrendLineDraftAnchors } from '../src/features/chart';
import { constructChartTrendLineDrawingFromDraft } from '../src/features/chart';

function decimal(value: string) {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid test decimal: ${value}`);
  return parsed.value;
}

const first: ChartDrawingAnchor = {
  timestamp: '2026-09-05T00:00:00.000Z',
  price: decimal('100.25'),
};
const second: ChartDrawingAnchor = {
  timestamp: '2026-09-05T00:01:00.000Z',
  price: decimal('101.75'),
};

describe('P18.31 chart trend-line draft commit construction', () => {
  it('constructs the P18.1 committed trend-line shape from exactly two draft anchors', () => {
    const anchors: ChartTrendLineDraftAnchors = [first, second];

    expect(constructChartTrendLineDrawingFromDraft('drawing-31', anchors)).toEqual({
      id: 'drawing-31',
      kind: 'trend-line',
      start: first,
      end: second,
    });
  });

  it('fails closed for an empty draft instead of inventing committed drawing truth', () => {
    const anchors: ChartTrendLineDraftAnchors = [];

    expect(constructChartTrendLineDrawingFromDraft('drawing-empty', anchors)).toBeNull();
  });

  it('fails closed for a one-anchor draft instead of inventing a second anchor', () => {
    const anchors: ChartTrendLineDraftAnchors = [first];

    expect(constructChartTrendLineDrawingFromDraft('drawing-one', anchors)).toBeNull();
  });

  it('uses the caller-supplied drawing identity and leaves draft-anchor evidence unchanged', () => {
    const anchors: ChartTrendLineDraftAnchors = [first, second];

    const drawing = constructChartTrendLineDrawingFromDraft('caller-owned-id', anchors);

    expect(drawing?.id).toBe('caller-owned-id');
    expect(anchors).toEqual([first, second]);
  });
});
