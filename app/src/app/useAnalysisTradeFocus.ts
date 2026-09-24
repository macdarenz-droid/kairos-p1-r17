import { useMemo } from 'react';
import { createLightweightChartsV5VisibleRangePort, type ChartVisibleTimeRange } from '../features/chart';
import type { LightweightChartsV5ProductionDrawingBindingLifecycle } from '../features/chart/lightweightChartsV5ProductionRenderer';

const inertLifecycle: LightweightChartsV5ProductionDrawingBindingLifecycle = Object.freeze({ attach() { /* no trade window */ }, detach() { /* no trade window */ } });

/**
 * Moves a freshly bound chart to the trade window once its candles are in.
 * It waits for the first visible logical range (the vendor reports none before
 * data), applies the window once through the visible-range port, then lets go,
 * so the user can scroll and zoom freely. It changes no data.
 */
export function createAnalysisTradeFocusLifecycle(range: ChartVisibleTimeRange): LightweightChartsV5ProductionDrawingBindingLifecycle {
  const bound = new Map<unknown, () => void>();
  const lifecycle: LightweightChartsV5ProductionDrawingBindingLifecycle = {
    attach(binding, handle) {
      const port = createLightweightChartsV5VisibleRangePort(binding.resolveChart(handle));
      if (port.getVisibleLogicalRange() !== null) { port.setVisibleTimeRange(range); return; }
      let unsubscribe: (() => void) | null = null;
      unsubscribe = port.subscribeVisibleLogicalRangeChange(next => {
        if (next === null || unsubscribe === null) return;
        const stop = unsubscribe;
        unsubscribe = null;
        bound.delete(handle);
        stop();
        port.setVisibleTimeRange(range);
      });
      bound.set(handle, () => { unsubscribe?.(); unsubscribe = null; });
    },
    detach(handle) {
      bound.get(handle)?.();
      bound.delete(handle);
    },
  };
  return Object.freeze(lifecycle);
}

/** One focus lifecycle per trade window; inert when there is no window. */
export function useAnalysisTradeFocus(range: ChartVisibleTimeRange | null): LightweightChartsV5ProductionDrawingBindingLifecycle {
  const fromMs = range?.fromMs ?? null, toMs = range?.toMs ?? null;
  return useMemo(() => (fromMs === null || toMs === null ? inertLifecycle : createAnalysisTradeFocusLifecycle({ fromMs, toMs })), [fromMs, toMs]);
}
