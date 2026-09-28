import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import type { HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration } from '../src/app/homeDashboardLiveCryptoBubbleRuntimeOptionsComposition';
import { useHomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusViewModel } from '../src/app/useHomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusViewModel';
import { useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel } from '../src/app/useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel';
import { useHomeDashboardLiveCryptoBubblePresentationObservedRuntime, type HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions } from '../src/app/useHomeDashboardLiveCryptoBubblePresentationObservedRuntime';
import type { HomeDashboardLiveCryptoBubblePresentationStateObservation } from '../src/application/dashboard/homeDashboardLiveCryptoBubblePresentationStateObservationBridge';

const mocks = vi.hoisted(() => ({ startRuntime: vi.fn() }));
vi.mock('../src/app/binanceHomeDashboardLiveCryptoBubblePresentationObservedRuntimeComposition', () => ({
  startBinanceHomeDashboardLiveCryptoBubblePresentationObservedRuntime: mocks.startRuntime,
}));

describe('configured Bubble runtime lifecycle stability', () => {
  beforeEach(() => { mocks.startRuntime.mockReset(); });

  for (const kind of ['pixel', 'normalized'] as const) {
    it(`${kind}: preserves one runtime across state updates and equivalent configuration wrappers`, async () => {
      const close = vi.fn();
      let resolve!: (value: unknown) => void;
      mocks.startRuntime.mockReturnValue(new Promise((done) => { resolve = done; }));
      const configuration: HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration = {
        excludedStablecoinBaseAssets: new Set(['USDC']),
        neutralMaxAbsoluteMovementPercent: '0.25' as DecimalString,
      };
      const policy = { minimumRadiusCssPixels: 10, maximumRadiusCssPixels: 50 };
      const { result, rerender, unmount } = renderHook(({ config }) => kind === 'pixel'
        ? useHomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusViewModel(config, policy)
        : useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel(config),
      { initialProps: { config: configuration } });
      expect(mocks.startRuntime).toHaveBeenCalledTimes(1);
      const sink = mocks.startRuntime.mock.calls[0]![2].observationSink;
      const observation: HomeDashboardLiveCryptoBubblePresentationStateObservation = {
        metricObservation: {} as never,
        presentationStateProjection: { ok: true, metricObservation: {} as never, entries: [] },
      };
      act(() => sink.onObservation(observation));
      expect(result.current.runtimeState.latestObservation).toBe(observation);
      const error = new Error('temporary acquisition error');
      act(() => sink.onError(error));
      expect(result.current.runtimeState.lastError).toBe(error);
      expect(result.current.runtimeState.latestObservation).toBe(observation);
      expect(mocks.startRuntime).toHaveBeenCalledTimes(1);
      rerender({ config: { ...configuration } });
      expect(mocks.startRuntime).toHaveBeenCalledTimes(1);
      await act(async () => resolve({ ok: true, runtime: { instruments: [], close } }));
      expect(result.current.runtimeState.status).toBe('running');
      expect(result.current.runtimeState.lastError).toBe(error);
      expect(mocks.startRuntime).toHaveBeenCalledTimes(1);
      expect(close).not.toHaveBeenCalled();
      unmount();
      expect(close).toHaveBeenCalledTimes(1);
    });
  }

  for (const field of ['exclusions', 'topN', 'signal', 'document', 'timer', 'threshold', 'observedClock', 'evaluationClock'] as const) {
    it(`restarts and closes the old runtime when ${field} changes`, async () => {
      const closes: ReturnType<typeof vi.fn>[] = [];
      mocks.startRuntime.mockImplementation(async () => {
        const close = vi.fn();
        closes.push(close);
        return { ok: true, runtime: { instruments: [], close } };
      });
      const options: HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions = {
        universe: { excludedStablecoinBaseAssets: new Set(['USDC']), topNCount: 30 },
        presentationPolicy: { neutralMaxAbsoluteMovementPercent: '0.25' as DecimalString },
      };
      const initial = {
        options,
        observed: () => '2026-09-11T00:00:00.000Z',
        evaluation: () => 0,
      };
      const { result, rerender, unmount } = renderHook(({ options, observed, evaluation }) =>
        useHomeDashboardLiveCryptoBubblePresentationObservedRuntime(observed, evaluation, options),
      { initialProps: initial });
      await act(async () => {});
      expect(mocks.startRuntime).toHaveBeenCalledTimes(1);
      const oldSink = mocks.startRuntime.mock.calls[0]![2].observationSink;
      const next = { ...initial, options: { ...options } };
      if (field === 'exclusions') next.options.universe = { ...options.universe, excludedStablecoinBaseAssets: new Set(['USDC', 'DAI']) };
      if (field === 'topN') next.options.universe = { ...options.universe, topNCount: 5 };
      if (field === 'signal') next.options.universe = { ...options.universe, signal: new AbortController().signal };
      if (field === 'document') next.options.lifecycle = { document: document };
      if (field === 'timer') next.options.lifecycle = { timer: { schedule: vi.fn(), cancel: vi.fn() } };
      if (field === 'threshold') next.options.presentationPolicy = { neutralMaxAbsoluteMovementPercent: '0.5' as DecimalString };
      if (field === 'observedClock') next.observed = () => '2026-09-11T01:00:00.000Z';
      if (field === 'evaluationClock') next.evaluation = () => 1;
      await act(async () => rerender(next));
      expect(mocks.startRuntime).toHaveBeenCalledTimes(2);
      expect(closes[0]).toHaveBeenCalledTimes(1);
      expect(closes[1]).not.toHaveBeenCalled();
      act(() => oldSink.onError(new Error('late superseded error')));
      expect(result.current.lastError).toBeNull();
      expect(result.current.status).toBe('running');
      unmount();
      expect(closes[1]).toHaveBeenCalledTimes(1);
    });
  }
});
