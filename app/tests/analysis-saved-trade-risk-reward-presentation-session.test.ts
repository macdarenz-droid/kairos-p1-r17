import { describe, expect, it, vi } from 'vitest';
import type { JournalHistoryEntry } from '../src/application/journal';
import type { AnalysisCandleRendererFactory } from '../src/app/analysisCandleRendererSession';
import type { AnalysisSavedTradeChartReferenceProjection } from '../src/app/analysisSavedTradeChartReferenceProjection';
import type { AnalysisSavedTradeRiskRewardCanvasStyleSource } from '../src/app/analysisSavedTradeRiskRewardCanvasPaneRenderer';
import type { AnalysisSavedTradeRiskRewardReferenceProjection } from '../src/app/analysisSavedTradeRiskRewardReferenceProjection';
import type { AnalysisSavedTradeRiskRewardRendererProjection } from '../src/app/analysisSavedTradeRiskRewardRendererProjection';
import type { AnalysisSavedTradeRiskRewardRendererSession } from '../src/app/analysisSavedTradeRiskRewardRendererSession';
import { createAnalysisSavedTradeRiskRewardPresentationSession } from '../src/app/analysisSavedTradeRiskRewardPresentationSession';

const entry = {} as JournalHistoryEntry;
const scope = { instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' }, quoteAsset: 'USDT' } as const;
const extent = { start: '2026-09-14T01:00:00.000Z', end: '2026-09-14T02:00:00.000Z' } as const;
const styleSource = Object.freeze({
  lineWidth: 2,
  zoneOpacity: 0.2,
  resolveToken: vi.fn((token: string) => token),
}) satisfies AnalysisSavedTradeRiskRewardCanvasStyleSource;
const reference = { kind: 'reference-ready' } as AnalysisSavedTradeChartReferenceProjection;
const logical = { kind: 'risk-reward-ready' } as AnalysisSavedTradeRiskRewardReferenceProjection;
const renderer = { kind: 'renderer-ready' } as AnalysisSavedTradeRiskRewardRendererProjection;
const rendererFactory = {} as AnalysisCandleRendererFactory;

function harness(
  presentResult: ReturnType<AnalysisSavedTradeRiskRewardRendererSession['present']> = { kind: 'pending-series' },
) {
  const present = vi.fn(() => presentResult);
  const close = vi.fn();
  const rendererSession: AnalysisSavedTradeRiskRewardRendererSession = {
    rendererFactory, present, presentation: vi.fn(() => null), close,
  };
  const projectReference = vi.fn(() => reference);
  const projectLogical = vi.fn(() => logical);
  const projectRenderer = vi.fn(() => renderer);
  const session = createAnalysisSavedTradeRiskRewardPresentationSession({
    createRendererSession: () => rendererSession,
    projectReference,
    projectLogical,
    projectRenderer,
  });
  return { session, present, close, projectReference, projectLogical, projectRenderer };
}

describe('Analysis saved-trade Risk/Reward presentation session', () => {
  it('delegates exact saved trade, chart scope, extent and style through released owners', () => {
    const { session, present, projectReference, projectLogical, projectRenderer } = harness();
    const result = session.present({ entry, scope, extent, styleSource });

    expect(session.rendererFactory).toBe(rendererFactory);
    expect(projectReference).toHaveBeenCalledWith(entry, scope);
    expect(projectLogical).toHaveBeenCalledWith(reference, extent);
    expect(projectRenderer).toHaveBeenCalledWith(logical);
    expect(present).toHaveBeenCalledWith(renderer, styleSource);
    expect(result).toEqual({
      reference, logical, renderer, presentation: { kind: 'pending-series' },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(session)).toBe(true);
    expect(session.presentation()).toBe(result);
  });

  it('preserves exact unavailable evidence through the production renderer session', () => {
    const unavailableLogical = Object.freeze({
      kind: 'unavailable' as const, reason: 'planned-stop-missing' as const, referenceReason: null,
    });
    const unavailableRenderer = Object.freeze({
      kind: 'unavailable' as const, reason: 'planned-stop-missing' as const,
    }) satisfies AnalysisSavedTradeRiskRewardRendererProjection;
    const { session, present, projectLogical, projectRenderer } = harness(unavailableRenderer);
    projectLogical.mockReturnValue(unavailableLogical);
    projectRenderer.mockReturnValue(unavailableRenderer);

    const result = session.present({ entry, scope, extent, styleSource });
    expect(result.logical).toBe(unavailableLogical);
    expect(result.renderer).toBe(unavailableRenderer);
    expect(result.presentation).toBe(unavailableRenderer);
    expect(present).toHaveBeenCalledWith(unavailableRenderer, styleSource);
  });

  it('retains the last complete result when a lower owner rejects ambiguous evidence', () => {
    const { session, projectRenderer } = harness();
    const first = session.present({ entry, scope, extent, styleSource });
    projectRenderer.mockImplementationOnce(() => {
      throw new Error('risk-reward-renderer-evidence-ambiguous');
    });

    expect(() => session.present({ entry, scope, extent, styleSource })).toThrow(
      'risk-reward-renderer-evidence-ambiguous',
    );
    expect(session.presentation()).toBe(first);
  });

  it('closes the renderer owner once, clears evidence and rejects later presentation', () => {
    const { session, close } = harness();
    session.present({ entry, scope, extent, styleSource });
    session.close();
    session.close();

    expect(close).toHaveBeenCalledOnce();
    expect(session.presentation()).toBeNull();
    expect(() => session.present({ entry, scope, extent, styleSource })).toThrow(
      'analysis-saved-trade-risk-reward-presentation-session-closed',
    );
  });
});
