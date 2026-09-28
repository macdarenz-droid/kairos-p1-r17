import type { ChartDrawingAnchor } from './chartDrawingContract';

export type ChartTrendLineDraftAnchors =
  | readonly []
  | readonly [ChartDrawingAnchor]
  | readonly [ChartDrawingAnchor, ChartDrawingAnchor];

export interface ChartTrendLineDraftAnchorCollectionSession {
  getAnchors(): ChartTrendLineDraftAnchors;
  appendAnchor(anchor: ChartDrawingAnchor): ChartTrendLineDraftAnchors;
  clear(): ChartTrendLineDraftAnchors;
  destroy(): void;
}

export interface ChartTrendLineDraftAnchorCollectionPort {
  create(): ChartTrendLineDraftAnchorCollectionSession;
}

/**
 * P18.28 provider-neutral trend-line draft anchor collection.
 *
 * This boundary owns only the ephemeral anchor evidence collected for one
 * trend-line draft. It deliberately does not own drawing-interaction status:
 * P18.21-P18.24 remain the sole interaction state/event/reducer/session owners.
 *
 * A session stores at most the two anchors required by the authoritative P18.1
 * trend-line drawing contract. A third append fails closed until the caller
 * explicitly clears the draft. clear() never dispatches interaction events and
 * never mutates committed drawing truth.
 *
 * No provider APIs, drawing IDs, committed drawing creation, persistence,
 * toolbar/UI state, drag/edit behavior, journal truth, or P19 Risk/Reward
 * behavior live here.
 */
export function createChartTrendLineDraftAnchorCollectionPort(): ChartTrendLineDraftAnchorCollectionPort {
  return {
    create(): ChartTrendLineDraftAnchorCollectionSession {
      let anchors: ChartTrendLineDraftAnchors = [];
      let destroyed = false;

      const assertActive = (): void => {
        if (destroyed) throw new Error('chart-trend-line-draft-anchor-collection-destroyed');
      };

      return {
        getAnchors(): ChartTrendLineDraftAnchors {
          assertActive();
          return anchors;
        },
        appendAnchor(anchor): ChartTrendLineDraftAnchors {
          assertActive();
          if (anchors.length === 0) {
            anchors = [anchor];
            return anchors;
          }
          if (anchors.length === 1) {
            anchors = [anchors[0], anchor];
            return anchors;
          }
          throw new Error('chart-trend-line-draft-anchor-collection-complete');
        },
        clear(): ChartTrendLineDraftAnchors {
          assertActive();
          anchors = [];
          return anchors;
        },
        destroy(): void {
          if (destroyed) return;
          destroyed = true;
          anchors = [];
        },
      };
    },
  };
}
