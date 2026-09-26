import { expect, it, vi } from 'vitest';
import { getChartTheme } from '../src/design-system/themes';
import type { DecimalString } from '../src/domain/trades';
import type { PresentedChartRenderer } from '../src/features/chart/lightweightChartsV5ProductionRenderer';
import type { MarketCandleHistorySnapshot } from '../src/services/market-data/MarketCandleHistoryPort';
import {
  createAnalysisLiveCandleRouteSession,
  type AnalysisLiveCandleRouteSelection,
} from '../src/app/analysisLiveCandleRouteSession';
import type {
  BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleResult,
  BinanceAnalysisLiveCandleBrowserAvailabilityObserver,
} from '../src/app/binanceAnalysisLiveCandleBrowserAvailabilityLifecycle';
import type { BinanceAnalysisLiveCandleGapBackfillRecoveryOptions } from '../src/app/binanceAnalysisLiveCandleGapBackfillRecoveryCoordination';

const snapshot: MarketCandleHistorySnapshot = {
  source: 'market-reference',
  timeZone: 'UTC',
  request: {
    instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' },
    interval: '1m',
    limit: 500,
  },
  observedAt: '2026-09-13T11:30:00.000Z',
  candles: [{
    openTime: '2026-09-13T11:29:00.000Z',
    closeTime: '2026-09-13T11:29:59.999Z',
    open: '2300' as DecimalString,
    high: '2302' as DecimalString,
    low: '2299' as DecimalString,
    close: '2301' as DecimalString,
  }],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function fakeRenderer(): PresentedChartRenderer {
  return {
    render: vi.fn(),
    updateLatestCandle: vi.fn(),
    setTheme: vi.fn(),
    resetView: vi.fn(),
    showRecent: vi.fn(),
    zoom: vi.fn(),
    pan: vi.fn(),
    destroy: vi.fn(),
  };
}

function harness() {
  const calls: BinanceAnalysisLiveCandleGapBackfillRecoveryOptions[] = [];
  const results: Array<ReturnType<typeof deferred<BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleResult>>> = [];
  let observer!: BinanceAnalysisLiveCandleBrowserAvailabilityObserver;
  const lifecycle = {
    replace: vi.fn((options: BinanceAnalysisLiveCandleGapBackfillRecoveryOptions) => {
      calls.push(options);
      const result = deferred<BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleResult>();
      results.push(result);
      return result.promise;
    }),
    close: vi.fn(),
    availability: vi.fn(() => 'available' as const),
    isActive: vi.fn(() => true),
  };
  const renderers: PresentedChartRenderer[] = [];
  const createRendererSession = vi.fn(() => {
    const renderer = fakeRenderer();
    renderers.push(renderer);
    return renderer;
  });
  const session = createAnalysisLiveCandleRouteSession({
    createLifecycle(nextObserver) { observer = nextObserver; return lifecycle; },
    createRendererSession,
  });
  return { session, lifecycle, calls, results, renderers, createRendererSession, observer: () => observer };
}

function selection(overrides: Partial<AnalysisLiveCandleRouteSelection> = {}): AnalysisLiveCandleRouteSelection {
  return {
    container: document.createElement('div'),
    instrument: snapshot.request.instrument,
    interval: snapshot.request.interval,
    themeId: 'ocean',
    ...overrides,
  };
}

it('supplies exact product policy and hands one authoritative renderer to the live lifecycle', async () => {
  const h = harness();
  const onActivationResult = vi.fn();
  const selected = selection({ onActivationResult });
  const pending = h.session.replace(selected);

  expect(h.calls[0].instrument).toBe(selected.instrument);
  expect(h.calls[0].interval).toBe('1m');
  expect(h.calls[0].historyLimit).toBe(500);
  expect(h.calls[0].reconnectPolicy).toEqual({ initialDelayMs: 1_000, maxDelayMs: 8_000, maxAttempts: 4 });

  const returned = h.calls[0].renderHistory(snapshot);
  expect(h.createRendererSession).toHaveBeenCalledWith({ container: selected.container, snapshot, themeId: 'ocean' });
  expect(returned).toBe(h.renderers[0]);
  expect(h.session.currentRenderer()).toBe(returned);

  const success = { ok: true as const, snapshot };
  h.results[0].resolve(success);
  await expect(pending).resolves.toBe(success);
  expect(onActivationResult).toHaveBeenCalledWith(success);
  expect(h.session.isActive()).toBe(true);
  expect(h.session.availability()).toBe('available');
});

it('invalidates the old selection before replacement and suppresses its late callbacks', async () => {
  const h = harness();
  const oldState = vi.fn();
  const first = h.session.replace(selection({ onStateChange: oldState }));
  const firstRenderer = h.calls[0].renderHistory(snapshot);
  h.results[0].resolve({ ok: true, snapshot });
  await first;

  const nextState = vi.fn();
  const second = h.session.replace(selection({ instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' }, onStateChange: nextState }));
  expect(firstRenderer.destroy).toHaveBeenCalledTimes(1);
  expect(h.lifecycle.replace.mock.invocationCallOrder[1]).toBeLessThan(
    vi.mocked(firstRenderer.destroy).mock.invocationCallOrder[0],
  );
  h.calls[0].onStateChange?.('disconnected');
  h.calls[1].onStateChange?.('live');
  expect(oldState).not.toHaveBeenCalled();
  expect(nextState).toHaveBeenCalledWith('live');
  h.results[1].resolve({ ok: false, reason: 'history-empty' });
  await second;
});

it('uses the latest route theme for delayed history and updates the active renderer', async () => {
  const h = harness();
  const pending = h.session.replace(selection({ themeId: 'kairos-depth' }));
  h.session.setTheme('cosmic');
  const renderer = h.calls[0].renderHistory(snapshot);
  expect(h.createRendererSession).toHaveBeenCalledWith(expect.objectContaining({ themeId: 'cosmic' }));
  h.session.setTheme('ocean');
  expect(h.renderers[0].setTheme).toHaveBeenCalledWith(getChartTheme('ocean'));
  h.results[0].resolve({ ok: true, snapshot });
  await pending;
});

it('fails closed after activation or authoritative recovery failure', async () => {
  const h = harness();
  const recovery = vi.fn();
  const pending = h.session.replace(selection({ onBackfillRecovery: recovery }));
  const renderer = h.calls[0].renderHistory(snapshot);
  h.results[0].resolve({ ok: false, reason: 'session-failed', detail: 'socket-refused' });
  await pending;
  expect(renderer.destroy).toHaveBeenCalledTimes(1);
  expect(h.session.currentRenderer()).toBeNull();

  const replacement = h.session.replace(selection({ onBackfillRecovery: recovery }));
  const nextRenderer = h.calls[1].renderHistory(snapshot);
  h.results[1].resolve({ ok: true, snapshot });
  await replacement;
  h.calls[1].onBackfillRecovery?.({ ok: false, reason: 'history-empty' });
  expect(nextRenderer.destroy).toHaveBeenCalledTimes(1);
  expect(recovery).toHaveBeenCalledWith({ ok: false, reason: 'history-empty' });
});

it('forwards browser resume observations only to the current selection and clears failed resumed rendering', async () => {
  const h = harness();
  const availability = vi.fn();
  const activation = vi.fn();
  const pending = h.session.replace(selection({ onAvailabilityChange: availability, onActivationResult: activation }));
  const renderer = h.calls[0].renderHistory(snapshot);
  h.results[0].resolve({ ok: true, snapshot });
  await pending;

  h.observer().onAvailabilityChange?.('offline');
  h.observer().onActivationResult?.({ ok: false, reason: 'history-failed', failure: { ok: false, reason: 'transport-failed' } });
  expect(availability).toHaveBeenCalledWith('offline');
  expect(activation).toHaveBeenLastCalledWith({ ok: false, reason: 'history-failed', failure: { ok: false, reason: 'transport-failed' } });
  expect(renderer.destroy).toHaveBeenCalledTimes(1);
});

it('closes lifecycle and renderer once and rejects later activation', async () => {
  const h = harness();
  const pending = h.session.replace(selection());
  const renderer = h.calls[0].renderHistory(snapshot);
  h.results[0].resolve({ ok: true, snapshot });
  await pending;

  h.session.close();
  h.session.close();
  expect(h.lifecycle.close).toHaveBeenCalledTimes(1);
  expect(renderer.destroy).toHaveBeenCalledTimes(1);
  expect(h.session.currentRenderer()).toBeNull();
  expect(h.session.isActive()).toBe(false);
  await expect(h.session.replace(selection())).resolves.toEqual({ ok: false, reason: 'superseded' });
  expect(h.lifecycle.replace).toHaveBeenCalledTimes(1);
});
