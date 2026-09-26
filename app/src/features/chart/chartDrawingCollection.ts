import type { ChartDrawing, ChartDrawingId } from './chartDrawingContract';

export interface ChartDrawingCollectionSession {
  getDrawings(): readonly ChartDrawing[];
  getDrawing(drawingId: ChartDrawingId): ChartDrawing | null;
  addDrawing(drawing: ChartDrawing): readonly ChartDrawing[];
  replaceDrawing(drawingId: ChartDrawingId, drawing: ChartDrawing): readonly ChartDrawing[];
  removeDrawing(drawingId: ChartDrawingId): readonly ChartDrawing[];
  destroy(): void;
}

export interface ChartDrawingCollectionPort {
  create(): ChartDrawingCollectionSession;
}

/**
 * P18.33 provider-neutral committed drawing collection.
 *
 * This boundary is the sole in-memory owner of the committed drawing set for
 * one active drawing session. It accepts only already-constructed P18.1
 * ChartDrawing truth, preserves insertion order, rejects duplicate identities,
 * and exposes read snapshots plus exact identity lookup. P18.44 extends this
 * same owner with strict identity-preserving replace/remove operations so later
 * edit/delete coordinators cannot become a second committed-set mutation owner.
 *
 * It deliberately does not allocate IDs, construct drawing edits, decide
 * interaction transitions, dispatch interaction events, project/render provider
 * data, refresh presentation, persist/restore saved analysis, mutate journal
 * truth, or own P19 Risk/Reward semantics. P20 remains the future saved-analysis/
 * persistence boundary.
 */
export function createChartDrawingCollectionPort(): ChartDrawingCollectionPort {
  return {
    create(): ChartDrawingCollectionSession {
      const drawings = new Map<ChartDrawingId, ChartDrawing>();
      let destroyed = false;

      const assertActive = (): void => {
        if (destroyed) throw new Error('chart-drawing-collection-destroyed');
      };

      const snapshot = (): readonly ChartDrawing[] => Array.from(drawings.values());

      return {
        getDrawings(): readonly ChartDrawing[] {
          assertActive();
          return snapshot();
        },
        getDrawing(drawingId): ChartDrawing | null {
          assertActive();
          return drawings.get(drawingId) ?? null;
        },
        addDrawing(drawing): readonly ChartDrawing[] {
          assertActive();
          if (drawings.has(drawing.id)) {
            throw new Error('chart-drawing-collection-duplicate-id');
          }
          drawings.set(drawing.id, drawing);
          return snapshot();
        },
        replaceDrawing(drawingId, drawing): readonly ChartDrawing[] {
          assertActive();
          if (!drawings.has(drawingId)) {
            throw new Error('chart-drawing-collection-missing-id');
          }
          if (drawing.id !== drawingId) {
            throw new Error('chart-drawing-collection-identity-mismatch');
          }
          drawings.set(drawingId, drawing);
          return snapshot();
        },
        removeDrawing(drawingId): readonly ChartDrawing[] {
          assertActive();
          if (!drawings.has(drawingId)) {
            throw new Error('chart-drawing-collection-missing-id');
          }
          drawings.delete(drawingId);
          return snapshot();
        },
        destroy(): void {
          if (destroyed) return;
          destroyed = true;
          drawings.clear();
        },
      };
    },
  };
}
