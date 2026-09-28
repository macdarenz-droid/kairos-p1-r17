import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { AnalysisLiveCandleRouteSession } from '../src/app/analysisLiveCandleRouteSession';
import type { BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleResult } from '../src/app/binanceAnalysisLiveCandleBrowserAvailabilityLifecycle';
import { useAnalysisLiveCandleRouteSession } from '../src/app/useAnalysisLiveCandleRouteSession';

function harness(withRenderer = true) {
  const renderer = {
    pan: vi.fn(),
    zoom: vi.fn(),
    resetView: vi.fn(),
  };
  const session: AnalysisLiveCandleRouteSession = {
    replace: vi.fn(() => new Promise<BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleResult>(() => undefined)),
    setTheme: vi.fn(),
    currentRenderer: vi.fn(() => withRenderer ? renderer as never : null),
    availability: vi.fn(() => 'available' as const),
    isActive: vi.fn(() => true),
    close: vi.fn(),
  };
  return { renderer, session, createSession: vi.fn(() => session) };
}

const container = document.createElement('div');
const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;

it('delegates exact viewport commands to the released current renderer', () => {
  const h = harness();
  const { result } = renderHook(() => useAnalysisLiveCandleRouteSession({
    container,
    instrument,
    interval: '1m',
    themeId: 'ocean',
    createSession: h.createSession,
  }));

  act(() => {
    result.current.pan(-0.2);
    result.current.zoom(0.8);
    result.current.resetView();
  });

  expect(h.renderer.pan).toHaveBeenCalledWith(-0.2);
  expect(h.renderer.zoom).toHaveBeenCalledWith(0.8);
  expect(h.renderer.resetView).toHaveBeenCalledTimes(1);
  expect(h.session.currentRenderer).toHaveBeenCalledTimes(3);
  expect(h.createSession).toHaveBeenCalledTimes(1);
  expect(h.session.replace).toHaveBeenCalledTimes(1);
});

it('keeps viewport commands inert before a renderer exists and after unmount', () => {
  const h = harness(false);
  const { result, unmount } = renderHook(() => useAnalysisLiveCandleRouteSession({
    container,
    instrument,
    interval: '1m',
    themeId: 'ocean',
    createSession: h.createSession,
  }));

  const controls = { pan: result.current.pan, zoom: result.current.zoom, resetView: result.current.resetView };
  expect(() => {
    controls.pan(0.2);
    controls.zoom(1.25);
    controls.resetView();
  }).not.toThrow();
  expect(h.session.currentRenderer).toHaveBeenCalledTimes(3);

  unmount();
  controls.pan(0.2);
  controls.zoom(1.25);
  controls.resetView();
  expect(h.session.currentRenderer).toHaveBeenCalledTimes(3);
  expect(h.renderer.pan).not.toHaveBeenCalled();
  expect(h.renderer.zoom).not.toHaveBeenCalled();
  expect(h.renderer.resetView).not.toHaveBeenCalled();
});
