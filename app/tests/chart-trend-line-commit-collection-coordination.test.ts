import { describe, expect, it, vi } from 'vitest';
import { parsePositiveDecimalString } from '../src/domain/trades';
import {
  commitChartTrendLineDraftToCollection,
  createChartDrawingCollectionPort,
  createChartTrendLineDraftInteractionPort,
  type ChartDrawing,
  type ChartDrawingAnchor,
} from '../src/features/chart';

function decimal(value: string) {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid test decimal: ${value}`);
  return parsed.value;
}

const first: ChartDrawingAnchor = {
  timestamp: '2026-09-05T03:00:00.000Z',
  price: decimal('100.25'),
};
const second: ChartDrawingAnchor = {
  timestamp: '2026-09-05T03:01:00.000Z',
  price: decimal('101.75'),
};

function createPreviewSession() {
  const session = createChartTrendLineDraftInteractionPort().create(() => undefined);
  session.dispatch({ type: 'select-tool', tool: 'trend-line' });
  session.acceptAnchor(first);
  session.acceptAnchor(second);
  return session;
}

describe('P18.35 chart trend-line commit collection coordination', () => {
  it('allocates identity through P18.34, commits through P18.32, and stores through P18.33', () => {
    const session = createPreviewSession();
    const collection = createChartDrawingCollectionPort().create();

    const drawing = commitChartTrendLineDraftToCollection(session, collection);

    expect(drawing).not.toBeNull();
    expect(drawing).toMatchObject({
      kind: 'trend-line',
      start: first,
      end: second,
    });
    expect(session.getState()).toEqual({ status: 'committed', drawingId: drawing?.id });
    expect(session.getAnchors()).toEqual([]);
    expect(collection.getDrawings()).toEqual([drawing]);
    expect(collection.getDrawing(drawing!.id)).toBe(drawing);
  });

  it('fails closed before preview without allocating committed collection truth', () => {
    const session = createChartTrendLineDraftInteractionPort().create(() => undefined);
    const collection = createChartDrawingCollectionPort().create();
    session.dispatch({ type: 'select-tool', tool: 'trend-line' });
    session.acceptAnchor(first);

    expect(commitChartTrendLineDraftToCollection(session, collection)).toBeNull();
    expect(session.getState()).toEqual({ status: 'drawing', tool: 'trend-line' });
    expect(session.getAnchors()).toEqual([first]);
    expect(collection.getDrawings()).toEqual([]);
  });

  it('preflights collection lifecycle before authoritative commit transition', () => {
    const session = createPreviewSession();
    const collection = createChartDrawingCollectionPort().create();
    collection.destroy();

    expect(() => commitChartTrendLineDraftToCollection(session, collection)).toThrow(
      'chart-drawing-collection-destroyed',
    );
    expect(session.getState()).toEqual({ status: 'preview', tool: 'trend-line' });
    expect(session.getAnchors()).toEqual([first, second]);
  });

  it('fails closed on an allocated identity collision before committing or replacing collection truth', () => {
    const collisionId = '00000000-0000-4000-8000-000000000035';
    const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(collisionId);
    const session = createPreviewSession();
    const collection = createChartDrawingCollectionPort().create();
    const existing: ChartDrawing = {
      id: collisionId,
      kind: 'trend-line',
      start: first,
      end: second,
    };
    collection.addDrawing(existing);

    expect(commitChartTrendLineDraftToCollection(session, collection)).toBeNull();
    expect(session.getState()).toEqual({ status: 'preview', tool: 'trend-line' });
    expect(session.getAnchors()).toEqual([first, second]);
    expect(collection.getDrawings()).toEqual([existing]);

    randomUUID.mockRestore();
  });
});
