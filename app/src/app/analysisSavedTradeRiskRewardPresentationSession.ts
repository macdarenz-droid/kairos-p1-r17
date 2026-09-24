import type { JournalHistoryEntry } from '../application/journal';
import type { ChartTimestamp } from '../features/chart';
import type { AnalysisCandleRendererFactory } from './analysisCandleRendererSession';
import {
  projectAnalysisSavedTradeChartReference,
  type AnalysisSavedTradeChartReferenceProjection,
  type AnalysisSavedTradeChartReferenceScope,
} from './analysisSavedTradeChartReferenceProjection';
import type { AnalysisSavedTradeRiskRewardCanvasStyleSource } from './analysisSavedTradeRiskRewardCanvasPaneRenderer';
import {
  projectAnalysisSavedTradeRiskRewardReference,
  type AnalysisSavedTradeRiskRewardReferenceProjection,
} from './analysisSavedTradeRiskRewardReferenceProjection';
import {
  projectAnalysisSavedTradeRiskRewardRenderer,
  type AnalysisSavedTradeRiskRewardRendererProjection,
} from './analysisSavedTradeRiskRewardRendererProjection';
import {
  createAnalysisSavedTradeRiskRewardRendererSession,
  type AnalysisSavedTradeRiskRewardRendererSession,
  type AnalysisSavedTradeRiskRewardRendererSessionPresentation,
} from './analysisSavedTradeRiskRewardRendererSession';

export interface AnalysisSavedTradeRiskRewardPresentationInput {
  readonly entry: JournalHistoryEntry;
  readonly scope: AnalysisSavedTradeChartReferenceScope;
  readonly extent: Readonly<{ readonly start: ChartTimestamp; readonly end: ChartTimestamp }>;
  readonly styleSource: AnalysisSavedTradeRiskRewardCanvasStyleSource;
}

export interface AnalysisSavedTradeRiskRewardPresentationResult {
  readonly reference: AnalysisSavedTradeChartReferenceProjection;
  readonly logical: AnalysisSavedTradeRiskRewardReferenceProjection;
  readonly renderer: AnalysisSavedTradeRiskRewardRendererProjection;
  readonly presentation: AnalysisSavedTradeRiskRewardRendererSessionPresentation;
}

export interface AnalysisSavedTradeRiskRewardPresentationSession {
  readonly rendererFactory: AnalysisCandleRendererFactory;
  present(
    input: AnalysisSavedTradeRiskRewardPresentationInput,
  ): AnalysisSavedTradeRiskRewardPresentationResult;
  presentation(): AnalysisSavedTradeRiskRewardPresentationResult | null;
  close(): void;
}

export interface AnalysisSavedTradeRiskRewardPresentationSessionDependencies {
  readonly createRendererSession?: () => AnalysisSavedTradeRiskRewardRendererSession;
  readonly projectReference?: typeof projectAnalysisSavedTradeChartReference;
  readonly projectLogical?: typeof projectAnalysisSavedTradeRiskRewardReference;
  readonly projectRenderer?: typeof projectAnalysisSavedTradeRiskRewardRenderer;
}

/**
 * Composes an exact P12-hydrated saved trade and caller-owned chart evidence
 * through the released Gate438, Gate448, Gate449 and Gate454 owners. This
 * application boundary adds no request, persistence, calculation, provider
 * primitive, journal mutation or financial inference.
 */
export function createAnalysisSavedTradeRiskRewardPresentationSession(
  dependencies: AnalysisSavedTradeRiskRewardPresentationSessionDependencies = {},
): AnalysisSavedTradeRiskRewardPresentationSession {
  const rendererSession = (dependencies.createRendererSession
    ?? createAnalysisSavedTradeRiskRewardRendererSession)();
  const projectReference = dependencies.projectReference ?? projectAnalysisSavedTradeChartReference;
  const projectLogical = dependencies.projectLogical ?? projectAnalysisSavedTradeRiskRewardReference;
  const projectRenderer = dependencies.projectRenderer ?? projectAnalysisSavedTradeRiskRewardRenderer;
  let current: AnalysisSavedTradeRiskRewardPresentationResult | null = null;
  let closed = false;

  return Object.freeze({
    rendererFactory: rendererSession.rendererFactory,
    present(input: AnalysisSavedTradeRiskRewardPresentationInput) {
      if (closed) throw new Error('analysis-saved-trade-risk-reward-presentation-session-closed');
      const reference = projectReference(input.entry, input.scope);
      const logical = projectLogical(reference, input.extent);
      const renderer = projectRenderer(logical);
      const presentation = rendererSession.present(renderer, input.styleSource);
      const next = Object.freeze({ reference, logical, renderer, presentation });
      current = next;
      return next;
    },
    presentation() {
      return current;
    },
    close() {
      if (closed) return;
      closed = true;
      current = null;
      rendererSession.close();
    },
  });
}
