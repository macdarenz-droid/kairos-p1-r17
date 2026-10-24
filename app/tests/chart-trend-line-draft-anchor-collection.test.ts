import { describe, expect, it } from 'vitest';
import { parsePositiveDecimalString } from '../src/domain/trades';
import type { ChartDrawingAnchor } from '../src/features/chart';
import { createChartTrendLineDraftAnchorCollectionPort } from '../src/features/chart';

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
const third: ChartDrawingAnchor = {
  timestamp: '2026-09-04T10:02:00.000Z',
  price: decimal('102.5'),
};

describe('P18.28 chart trend-line draft anchor collection', () => {
  it('collects exactly the first and second anchors without creating committed drawing truth', () => {
    const session = createChartTrendLineDraftAnchorCollectionPort().create();

    expect(session.getAnchors()).toEqual([]);
    expect(session.appendAnchor(first)).toEqual([first]);
    expect(session.appendAnchor(second)).toEqual([first, second]);
    expect(session.getAnchors()).toEqual([first, second]);
  });

  it('fails closed on a third anchor until the draft is explicitly cleared', () => {
    const session = createChartTrendLineDraftAnchorCollectionPort().create();
    session.appendAnchor(first);
    session.appendAnchor(second);

    expect(() => session.appendAnchor(third)).toThrow(
      'chart-trend-line-draft-anchor-collection-complete',
    );
    expect(session.getAnchors()).toEqual([first, second]);
  });

  it('clear removes only ephemeral draft-anchor evidence and allows a new first anchor', () => {
    const session = createChartTrendLineDraftAnchorCollectionPort().create();
    session.appendAnchor(first);
    session.appendAnchor(second);

    expect(session.clear()).toEqual([]);
    expect(session.appendAnchor(third)).toEqual([third]);
  });

  it('keeps separate draft sessions isolated', () => {
    const port = createChartTrendLineDraftAnchorCollectionPort();
    const left = port.create();
    const right = port.create();

    left.appendAnchor(first);
    right.appendAnchor(second);

    expect(left.getAnchors()).toEqual([first]);
    expect(right.getAnchors()).toEqual([second]);
  });

  it('destroy is idempotent and later draft access fails closed', () => {
    const session = createChartTrendLineDraftAnchorCollectionPort().create();
    session.appendAnchor(first);

    session.destroy();
    session.destroy();

    expect(() => session.getAnchors()).toThrow(
      'chart-trend-line-draft-anchor-collection-destroyed',
    );
    expect(() => session.appendAnchor(second)).toThrow(
      'chart-trend-line-draft-anchor-collection-destroyed',
    );
  });
});
