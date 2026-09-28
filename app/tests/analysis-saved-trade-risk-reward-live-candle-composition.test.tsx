import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { JournalHistoryEntry } from '../src/application/journal';
import { AnalysisSavedTradeRiskRewardLiveCandleCanvas } from '../src/app/AnalysisSavedTradeRiskRewardLiveCandleCanvas';
import type { AnalysisLiveCandleCanvasProps } from '../src/app/AnalysisLiveCandleCanvas';
import type { AnalysisCandleRendererFactory } from '../src/app/analysisCandleRendererSession';
import type { AnalysisSavedTradeRiskRewardCanvasStyleSource } from '../src/app/analysisSavedTradeRiskRewardCanvasPaneRenderer';
import type { AnalysisSavedTradeRiskRewardReactBindingOptions } from '../src/app/useAnalysisSavedTradeRiskRewardPresentationSession';

const entry = {} as JournalHistoryEntry;
const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const extent = { start: '2026-09-15T00:00:00.000Z', end: '2026-09-15T04:00:00.000Z' } as const;
const styleSource = Object.freeze({
  lineWidth: 2,
  zoneOpacity: 0.2,
  resolveToken: vi.fn((token: string) => token),
}) satisfies AnalysisSavedTradeRiskRewardCanvasStyleSource;
const rendererFactory = {} as AnalysisCandleRendererFactory;

function harness(factory: AnalysisCandleRendererFactory | null = rendererFactory) {
  const useRiskRewardBinding = vi.fn((_options: AnalysisSavedTradeRiskRewardReactBindingOptions) => ({
    rendererFactory: factory,
    presentation: null,
    lastError: null,
  }));
  const LiveCanvas = vi.fn((_props: AnalysisLiveCandleCanvasProps) => null);
  const liveSession = { marker: 'live-session' };
  const renderer = { marker: 'renderer' };
  const createLiveSession = vi.fn((_dependencies: unknown) => liveSession);
  const createRendererSession = vi.fn(() => renderer);
  return { useRiskRewardBinding, LiveCanvas, liveSession, renderer, createLiveSession, createRendererSession };
}

function mount(h: ReturnType<typeof harness>, overrides: Partial<{
  instrument: typeof instrument;
  interval: string;
  quoteAsset: string;
  revision: number;
}> = {}) {
  return render(<AnalysisSavedTradeRiskRewardLiveCandleCanvas
    entry={entry}
    instrument={overrides.instrument ?? instrument}
    interval={overrides.interval ?? '5m'}
    quoteAsset={overrides.quoteAsset ?? 'USDT'}
    extent={extent}
    styleSource={styleSource}
    revision={overrides.revision ?? 7}
    LiveCanvas={h.LiveCanvas}
    useRiskRewardBinding={h.useRiskRewardBinding}
    createLiveSession={h.createLiveSession as never}
    createRendererSession={h.createRendererSession as never}
  />);
}

it('delegates exact saved-trade, chart scope, extent, style and revision evidence to Gate456', () => {
  const h = harness();
  mount(h);
  expect(h.useRiskRewardBinding).toHaveBeenCalledWith({
    entry,
    scope: { instrument, quoteAsset: 'USDT' },
    extent,
    styleSource,
    revision: 7,
  });
});

it('starts the released live canvas only after Gate456 exposes its exact renderer factory', () => {
  const h = harness();
  mount(h);
  expect(h.LiveCanvas).toHaveBeenCalledWith(expect.objectContaining({
    instrument,
    interval: '5m',
    quoteAsset: 'USDT',
    revision: 7,
    createSession: expect.any(Function),
  }), undefined);
});

it('injects only Gate456 renderer ownership into the released route session', () => {
  const h = harness();
  mount(h);
  const canvasProps = h.LiveCanvas.mock.calls.at(-1)?.[0];
  expect(canvasProps?.createSession?.()).toBe(h.liveSession);

  const dependencies = h.createLiveSession.mock.calls[0][0] as {
    createRendererSession(input: unknown): unknown;
  };
  const input = { container: document.createElement('div'), snapshot: {}, themeId: 'dark' };
  expect(dependencies.createRendererSession(input)).toBe(h.renderer);
  expect(h.createRendererSession).toHaveBeenCalledWith({ ...input, factory: rendererFactory });
});

it('delegates replacement scope without retaining a stale chart selection', () => {
  const h = harness();
  const view = mount(h);
  const nextInstrument = { venue: 'binance-spot', symbol: 'BTCUSDT' } as const;
  view.rerender(<AnalysisSavedTradeRiskRewardLiveCandleCanvas
    entry={entry}
    instrument={nextInstrument}
    interval="15m"
    quoteAsset="USDT"
    extent={extent}
    styleSource={styleSource}
    revision={8}
    LiveCanvas={h.LiveCanvas}
    useRiskRewardBinding={h.useRiskRewardBinding}
    createLiveSession={h.createLiveSession as never}
    createRendererSession={h.createRendererSession as never}
  />);

  expect(h.useRiskRewardBinding).toHaveBeenLastCalledWith(expect.objectContaining({
    scope: { instrument: nextInstrument, quoteAsset: 'USDT' },
    revision: 8,
  }));
  expect(h.LiveCanvas).toHaveBeenLastCalledWith(expect.objectContaining({
    instrument: nextInstrument,
    interval: '15m',
    revision: 8,
  }), undefined);
});

it('fails closed without starting the live owner when Gate456 has no renderer factory', () => {
  const h = harness(null);
  mount(h);
  expect(h.LiveCanvas).not.toHaveBeenCalled();
  expect(h.createLiveSession).not.toHaveBeenCalled();
});
