import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ThemeId } from '../src/design-system/themes';
import type { DecimalString } from '../src/domain/trades';
import type { AnalysisLiveCandleRouteSession } from '../src/app/analysisLiveCandleRouteSession';
import type { BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleResult } from '../src/app/binanceAnalysisLiveCandleBrowserAvailabilityLifecycle';
import { useAnalysisLiveCandleRouteSession } from '../src/app/useAnalysisLiveCandleRouteSession';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness() {
  const pending: Array<ReturnType<typeof deferred<BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleResult>>> = [];
  const session: AnalysisLiveCandleRouteSession = {
    replace: vi.fn(() => {
      const next = deferred<BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleResult>();
      pending.push(next);
      return next.promise;
    }),
    setTheme: vi.fn(),
    currentRenderer: vi.fn(() => null),
    availability: vi.fn(() => 'available' as const),
    isActive: vi.fn(() => true),
    close: vi.fn(),
  };
  const createSession = vi.fn(() => session);
  return { session, createSession, pending };
}

const container = document.createElement('div');
const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const options = (createSession: ReturnType<typeof harness>['createSession']) => ({
  container,
  instrument,
  interval: '1m',
  themeId: 'ocean' as const,
  createSession,
});

it('mounts one released route session and forwards the exact selected scope', () => {
  const h = harness();
  const { result } = renderHook(() => useAnalysisLiveCandleRouteSession(options(h.createSession)));
  expect(h.createSession).toHaveBeenCalledTimes(1);
  expect(h.session.replace).toHaveBeenCalledTimes(1);
  expect(vi.mocked(h.session.replace).mock.calls[0][0]).toEqual(expect.objectContaining({
    container,
    instrument,
    interval: '1m',
    themeId: 'ocean',
  }));
  expect(result.current.availability).toBe('available');
});

it('retains exact lifecycle observations without projecting visible copy', () => {
  const h = harness();
  const error = new Error('socket closed');
  const { result } = renderHook(() => useAnalysisLiveCandleRouteSession(options(h.createSession)));
  const selection = vi.mocked(h.session.replace).mock.calls[0][0];
  const disposition = { kind: 'ignored-stale' } as const;
  const backfillRequest = {
    instrument,
    interval: '1m',
    observation: {
      instrument,
      price: '2' as DecimalString,
      observedAt: '2026-09-13T13:00:30.000Z',
      sourceTimestamp: '2026-09-13T13:00:30.000Z',
    },
  } as const;
  const backfillRecovery = { ok: false, reason: 'history-empty' } as const;
  act(() => {
    selection.onAvailabilityChange?.('offline');
    selection.onStateChange?.('connecting');
    selection.onDisposition?.(disposition);
    selection.onBackfillRequired?.(backfillRequest);
    selection.onBackfillRecovery?.(backfillRecovery);
    selection.onError?.(error);
  });
  expect(result.current).toEqual(expect.objectContaining({
    availability: 'offline',
    connection: 'connecting',
    disposition,
    backfillRequest,
    backfillRecovery,
    lastError: error,
  }));
});

it('records exact activation success including its authoritative snapshot', async () => {
  const h = harness();
  const { result } = renderHook(() => useAnalysisLiveCandleRouteSession(options(h.createSession)));
  const success = {
    ok: true as const,
    snapshot: {
      source: 'market-reference' as const,
      timeZone: 'UTC' as const,
      request: { instrument, interval: '1m', limit: 500 },
      observedAt: '2026-09-13T13:01:00.000Z',
      candles: [{
        openTime: '2026-09-13T13:00:00.000Z', closeTime: '2026-09-13T13:00:59.999Z',
        open: '1' as DecimalString, high: '2' as DecimalString, low: '1' as DecimalString, close: '2' as DecimalString,
      }],
    },
  };
  await act(async () => h.pending[0].resolve(success));
  expect(result.current.activation).toBe(success);
});

it('updates theme without reacquiring the selected scope', () => {
  const h = harness();
  const initial = options(h.createSession);
  const { rerender } = renderHook(({ themeId }: { themeId: ThemeId }) => useAnalysisLiveCandleRouteSession({ ...initial, themeId }), {
    initialProps: { themeId: 'ocean' },
  });
  rerender({ themeId: 'cosmic' as const });
  expect(h.session.replace).toHaveBeenCalledTimes(1);
  expect(h.session.setTheme).toHaveBeenNthCalledWith(1, 'ocean');
  expect(h.session.setTheme).toHaveBeenNthCalledWith(2, 'cosmic');
});

it('replaces through the same session and suppresses superseded callbacks and completion', async () => {
  const h = harness();
  const initial = options(h.createSession);
  const { result, rerender } = renderHook(({ symbol }) => useAnalysisLiveCandleRouteSession({
    ...initial,
    instrument: { venue: 'binance-spot', symbol },
  }), { initialProps: { symbol: 'ETHUSDT' } });
  const oldSelection = vi.mocked(h.session.replace).mock.calls[0][0];
  rerender({ symbol: 'BTCUSDT' });
  const newSelection = vi.mocked(h.session.replace).mock.calls[1][0];
  act(() => oldSelection.onStateChange?.('disconnected'));
  expect(result.current.connection).toBeNull();
  act(() => newSelection.onStateChange?.('live'));
  expect(result.current.connection).toBe('live');
  await act(async () => h.pending[0].resolve({ ok: false, reason: 'history-empty' }));
  expect(result.current.activation).toBeNull();
  const current = { ok: false as const, reason: 'history-scope-mismatch' as const };
  await act(async () => h.pending[1].resolve(current));
  expect(result.current.activation).toBe(current);
  expect(h.createSession).toHaveBeenCalledTimes(1);
});

it('uses caller revision for refresh, reports rejected activation and closes once on unmount', async () => {
  const h = harness();
  const initial = options(h.createSession);
  const { result, rerender, unmount } = renderHook(({ revision }) => useAnalysisLiveCandleRouteSession({ ...initial, revision }), {
    initialProps: { revision: 0 },
  });
  rerender({ revision: 1 });
  expect(h.session.replace).toHaveBeenCalledTimes(2);
  const error = new Error('activation rejected');
  await act(async () => h.pending[1].reject(error));
  expect(result.current.lastError).toBe(error);
  unmount();
  unmount();
  expect(h.session.close).toHaveBeenCalledTimes(1);
});

it('reports synchronous session construction failure without starting selection', () => {
  const error = new Error('session construction failed');
  const createSession = vi.fn(() => { throw error; });
  const { result } = renderHook(() => useAnalysisLiveCandleRouteSession(options(createSession as never)));
  expect(result.current.lastError).toBe(error);
});
