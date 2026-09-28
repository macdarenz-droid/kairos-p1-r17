import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { JournalHistoryEntry } from '../src/application/journal';
import {
  AnalysisSavedTradeLiveCandleCanvas,
} from '../src/app/AnalysisSavedTradeLiveCandleCanvas';
import type { AnalysisLiveCandleCanvasProps } from '../src/app/AnalysisLiveCandleCanvas';
import type { AnalysisCandleRendererFactory } from '../src/app/analysisCandleRendererSession';
import type { AnalysisSavedTradeMarkerReactBindingOptions } from '../src/app/useAnalysisSavedTradeMarkerPresentationSession';
import { ThemeProvider } from '../src/design-system/themes';
import type { MarketCandleHistorySnapshot } from '../src/services/market-data/MarketCandleHistoryPort';

const entry = {} as JournalHistoryEntry;
const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const snapshot = {
  request: { instrument, interval: '5m', limit: 500 },
  candles: [],
} as unknown as MarketCandleHistorySnapshot;
const rendererFactory = {} as AnalysisCandleRendererFactory;

function harness(factory: AnalysisCandleRendererFactory | null = rendererFactory) {
  const useMarkerBinding = vi.fn((_options: AnalysisSavedTradeMarkerReactBindingOptions) => ({
    rendererFactory: factory,
    presentation: null,
    lastError: null,
  }));
  const LiveCanvas = vi.fn((props: AnalysisLiveCandleCanvasProps) => (
    <button type="button" onClick={() => props.onAuthoritativeSnapshot?.(snapshot)}>Publish snapshot</button>
  ));
  const liveSession = { marker: 'live-session' };
  const renderer = { marker: 'renderer' };
  const createLiveSession = vi.fn((_dependencies: unknown) => liveSession);
  const createRendererSession = vi.fn(() => renderer);
  return { useMarkerBinding, LiveCanvas, liveSession, renderer, createLiveSession, createRendererSession };
}

function mount(h: ReturnType<typeof harness>, props: Partial<{
  instrument: typeof instrument;
  interval: string;
  revision: number;
}> = {}) {
  return render(<ThemeProvider><AnalysisSavedTradeLiveCandleCanvas
    entry={entry}
    instrument={props.instrument ?? instrument}
    interval={props.interval ?? '5m'}
    quoteAsset="USDT"
    revision={props.revision ?? 4}
    LiveCanvas={h.LiveCanvas}
    useMarkerBinding={h.useMarkerBinding}
    createLiveSession={h.createLiveSession as never}
    createRendererSession={h.createRendererSession as never}
  /></ThemeProvider>);
}

it('composes Gate444 with the released live canvas only after its exact renderer factory exists', () => {
  const h = harness();
  mount(h);

  expect(h.useMarkerBinding).toHaveBeenCalledWith(expect.objectContaining({
    entry,
    scope: { instrument, quoteAsset: 'USDT' },
    snapshot: null,
    revision: 4,
  }));
  expect(h.LiveCanvas).toHaveBeenCalledWith(expect.objectContaining({
    instrument,
    interval: '5m',
    quoteAsset: 'USDT',
    revision: 4,
    createSession: expect.any(Function),
    onAuthoritativeSnapshot: expect.any(Function),
  }), undefined);
});

it('injects only Gate444 renderer ownership into the released route session', () => {
  const h = harness();
  mount(h);
  const canvasProps = h.LiveCanvas.mock.calls.at(-1)?.[0];
  const created = canvasProps?.createSession?.();
  expect(created).toBe(h.liveSession);
  expect(h.createLiveSession).toHaveBeenCalledTimes(1);

  const dependencies = h.createLiveSession.mock.calls[0][0] as {
    createRendererSession(input: unknown): unknown;
  };
  const input = { container: document.createElement('div'), snapshot, themeId: 'dark' };
  expect(dependencies.createRendererSession(input)).toBe(h.renderer);
  expect(h.createRendererSession).toHaveBeenCalledWith({ ...input, factory: rendererFactory });
});

it('returns the exact authoritative live history page to the same marker owner', () => {
  const h = harness();
  mount(h);
  act(() => screen.getByRole('button', { name: 'Publish snapshot' }).click());
  expect(h.useMarkerBinding).toHaveBeenLastCalledWith(expect.objectContaining({ snapshot }));
});

it('fails closed across scope changes instead of projecting a stale snapshot', () => {
  const h = harness();
  const view = mount(h);
  act(() => screen.getByRole('button', { name: 'Publish snapshot' }).click());
  expect(h.useMarkerBinding).toHaveBeenLastCalledWith(expect.objectContaining({ snapshot }));

  const nextInstrument = { venue: 'binance-spot', symbol: 'BTCUSDT' } as const;
  view.rerender(<ThemeProvider><AnalysisSavedTradeLiveCandleCanvas
    entry={entry}
    instrument={nextInstrument}
    interval="15m"
    quoteAsset="USDT"
    revision={5}
    LiveCanvas={h.LiveCanvas}
    useMarkerBinding={h.useMarkerBinding}
    createLiveSession={h.createLiveSession as never}
    createRendererSession={h.createRendererSession as never}
  /></ThemeProvider>);

  expect(h.useMarkerBinding).toHaveBeenLastCalledWith(expect.objectContaining({
    scope: { instrument: nextInstrument, quoteAsset: 'USDT' },
    snapshot: null,
    revision: 5,
  }));
});

it('does not start the live owner when Gate444 has no renderer factory', () => {
  const h = harness(null);
  mount(h);
  expect(h.LiveCanvas).not.toHaveBeenCalled();
  expect(h.createLiveSession).not.toHaveBeenCalled();
});
