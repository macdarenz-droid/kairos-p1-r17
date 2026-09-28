import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { JournalHistoryEntry } from '../src/application/journal';
import { AnalysisSavedTradeOverlayLiveCandleCanvas } from '../src/app/AnalysisSavedTradeOverlayLiveCandleCanvas';
import type { AnalysisLiveCandleCanvasProps } from '../src/app/AnalysisLiveCandleCanvas';
import type { AnalysisCandleRendererFactory } from '../src/app/analysisCandleRendererSession';
import type { AnalysisSavedTradeOverlayReactBindingOptions } from '../src/app/useAnalysisSavedTradeOverlayPresentationSession';
import { ThemeProvider } from '../src/design-system/themes';
import type { MarketCandleHistorySnapshot } from '../src/services/market-data/MarketCandleHistoryPort';

const entry = {} as JournalHistoryEntry;
const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const snapshot = {
  source: 'market-reference',
  timeZone: 'UTC',
  request: { instrument, interval: '5m', limit: 500 },
  observedAt: '2026-09-15T01:15:00.000Z',
  candles: [
    {
      openTime: '2026-09-15T01:00:00.000Z',
      closeTime: '2026-09-15T01:04:59.999Z',
      open: '100',
      high: '102',
      low: '99',
      close: '101',
    },
    {
      openTime: '2026-09-15T01:10:00.000Z',
      closeTime: '2026-09-15T01:14:59.999Z',
      open: '101',
      high: '104',
      low: '100',
      close: '103',
    },
  ],
} as unknown as MarketCandleHistorySnapshot;
const snapshotExtent = {
  start: '2026-09-15T01:00:00.000Z',
  end: '2026-09-15T01:14:59.999Z',
} as const;
const rendererFactory = {} as AnalysisCandleRendererFactory;

function harness(factory: AnalysisCandleRendererFactory | null = rendererFactory) {
  const useOverlayBinding = vi.fn((_options: AnalysisSavedTradeOverlayReactBindingOptions) => ({
    rendererFactory: factory,
    presentation: null,
    markerError: null,
    riskRewardError: null,
  }));
  const LiveCanvas = vi.fn((props: AnalysisLiveCandleCanvasProps) => (
    <button type="button" onClick={() => props.onAuthoritativeSnapshot?.(snapshot)}>Publish snapshot</button>
  ));
  const liveSession = { owner: 'live-session' };
  const renderer = { owner: 'renderer' };
  const createLiveSession = vi.fn((_dependencies: unknown) => liveSession);
  const createRendererSession = vi.fn(() => renderer);
  return { useOverlayBinding, LiveCanvas, liveSession, renderer, createLiveSession, createRendererSession };
}

function mount(h: ReturnType<typeof harness>, props: Partial<{
  instrument: typeof instrument;
  interval: string;
  quoteAsset: string;
  revision: number;
}> = {}) {
  return render(<ThemeProvider><AnalysisSavedTradeOverlayLiveCandleCanvas
    entry={entry}
    instrument={props.instrument ?? instrument}
    interval={props.interval ?? '5m'}
    quoteAsset={props.quoteAsset ?? 'USDT'}
    revision={props.revision ?? 9}
    LiveCanvas={h.LiveCanvas}
    useOverlayBinding={h.useOverlayBinding}
    createLiveSession={h.createLiveSession as never}
    createRendererSession={h.createRendererSession as never}
  /></ThemeProvider>);
}

it('delegates exact saved-trade, chart, marker and Risk/Reward evidence to Gate460 while awaiting history extent', () => {
  const h = harness();
  mount(h);
  expect(h.useOverlayBinding).toHaveBeenCalledWith(expect.objectContaining({
    entry,
    scope: { instrument, quoteAsset: 'USDT' },
    snapshot: null,
    extent: null,
    styleSource: expect.objectContaining({ lineWidth: 2, zoneOpacity: 1 }),
    revision: 9,
  }));
});

it('starts one released live canvas only after Gate460 exposes its exact renderer factory', () => {
  const h = harness();
  mount(h);
  expect(h.LiveCanvas).toHaveBeenCalledWith(expect.objectContaining({
    instrument,
    interval: '5m',
    quoteAsset: 'USDT',
    revision: 9,
    createSession: expect.any(Function),
    onAuthoritativeSnapshot: expect.any(Function),
  }), undefined);
});

it('injects only Gate460 shared renderer ownership into the released route session', () => {
  const h = harness();
  mount(h);
  const canvasProps = h.LiveCanvas.mock.calls.at(-1)?.[0];
  expect(canvasProps?.createSession?.()).toBe(h.liveSession);

  const dependencies = h.createLiveSession.mock.calls[0][0] as {
    createRendererSession(input: unknown): unknown;
  };
  const input = { container: document.createElement('div'), snapshot, themeId: 'dark' };
  expect(dependencies.createRendererSession(input)).toBe(h.renderer);
  expect(h.createRendererSession).toHaveBeenCalledWith({ ...input, factory: rendererFactory });
});

it('returns the exact authoritative live history page to the same overlay owner', () => {
  const h = harness();
  mount(h);
  act(() => screen.getByRole('button', { name: 'Publish snapshot' }).click());
  expect(h.useOverlayBinding).toHaveBeenLastCalledWith(expect.objectContaining({
    snapshot,
    extent: snapshotExtent,
  }));
});

it('fails closed instead of deriving Risk/Reward extent from mismatched history', () => {
  const h = harness();
  const mismatched = {
    ...snapshot,
    request: { ...snapshot.request, interval: '15m' },
  } as MarketCandleHistorySnapshot;
  h.LiveCanvas.mockImplementationOnce((props: AnalysisLiveCandleCanvasProps) => (
    <button type="button" onClick={() => props.onAuthoritativeSnapshot?.(mismatched)}>
      Publish mismatch
    </button>
  ));
  mount(h);
  act(() => screen.getByRole('button', { name: 'Publish mismatch' }).click());
  expect(h.useOverlayBinding).toHaveBeenLastCalledWith(expect.objectContaining({
    snapshot: mismatched,
    extent: null,
  }));
});

it('fails closed across selection replacement instead of projecting a stale snapshot', () => {
  const h = harness();
  const view = mount(h);
  act(() => screen.getByRole('button', { name: 'Publish snapshot' }).click());
  const nextInstrument = { venue: 'binance-spot', symbol: 'BTCUSDT' } as const;
  view.rerender(<ThemeProvider><AnalysisSavedTradeOverlayLiveCandleCanvas
    entry={entry}
    instrument={nextInstrument}
    interval="15m"
    quoteAsset="USDT"
    revision={10}
    LiveCanvas={h.LiveCanvas}
    useOverlayBinding={h.useOverlayBinding}
    createLiveSession={h.createLiveSession as never}
    createRendererSession={h.createRendererSession as never}
  /></ThemeProvider>);
  expect(h.useOverlayBinding).toHaveBeenLastCalledWith(expect.objectContaining({
    scope: { instrument: nextInstrument, quoteAsset: 'USDT' },
    snapshot: null,
    revision: 10,
  }));
});

it('does not start the live owner when Gate460 has no renderer factory', () => {
  const h = harness(null);
  mount(h);
  expect(h.LiveCanvas).not.toHaveBeenCalled();
  expect(h.createLiveSession).not.toHaveBeenCalled();
});
