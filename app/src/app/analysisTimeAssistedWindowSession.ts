import type { ChartEngineSeriesHandle } from '../features/chart/chartEngineDriver';
import type { LightweightChartsV5DriverBinding } from '../features/chart/lightweightChartsV5ModuleAdapter';
import type { LightweightChartsV5ProductionDrawingBindingLifecycle } from '../features/chart/lightweightChartsV5ProductionRenderer';

/** Padding either side of the trade interval, as a fraction of its span, with a floor so a short trade still shows context. */
export const ANALYSIS_TIME_ASSISTED_WINDOW_PADDING_FRACTION = 0.15;
export const ANALYSIS_TIME_ASSISTED_WINDOW_MIN_PADDING_MS = 5 * 60_000;

export interface AnalysisTimeAssistedWindowRange {
  readonly fromMs: number;
  readonly toMs: number;
}

export type AnalysisTimeAssistedWindowResult =
  | { readonly kind: 'shown'; readonly requested: AnalysisTimeAssistedWindowRange; readonly visible: AnalysisTimeAssistedWindowRange | null }
  | { readonly kind: 'pending-chart' }
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'invalid-range' };

export interface AnalysisTimeAssistedWindowSession {
  /** Hand this to the drawing-binding lifecycle fan-out so it sees the same chart as the drawing tools. */
  readonly lifecycle: LightweightChartsV5ProductionDrawingBindingLifecycle;
  /** Scrolls and zooms the bound chart's time scale to the padded interval; nothing else changes. The vendor applies the target range on its next frame, so `visible` is null here and read later through `visibleRange()`. */
  show(range: AnalysisTimeAssistedWindowRange): AnalysisTimeAssistedWindowResult;
  /** The bound chart's currently visible time range as the vendor reports it, or null without a chart or support. */
  visibleRange(): AnalysisTimeAssistedWindowRange | null;
  destroy(): void;
}

interface VendorTimeScaleRange { setVisibleRange(range: { readonly from: number; readonly to: number }): void; getVisibleRange?(): { readonly from: number; readonly to: number } | null }

const hasVisibleRange = (timeScale: unknown): timeScale is VendorTimeScaleRange =>
  typeof timeScale === 'object' && timeScale !== null && typeof (timeScale as { setVisibleRange?: unknown }).setVisibleRange === 'function';

/** Fans one drawing-binding lifecycle out to several owners (drawing tools and the time-assisted window share one production renderer). */
export function composeDrawingBindingLifecycles(...lifecycles: readonly LightweightChartsV5ProductionDrawingBindingLifecycle[]): LightweightChartsV5ProductionDrawingBindingLifecycle {
  return Object.freeze({
    attach(binding: LightweightChartsV5DriverBinding, handle: ChartEngineSeriesHandle) { for (const lifecycle of lifecycles) lifecycle.attach(binding, handle); },
    detach(handle: ChartEngineSeriesHandle) { for (const lifecycle of [...lifecycles].reverse()) lifecycle.detach(handle); },
  });
}

export function padTimeAssistedWindow(range: AnalysisTimeAssistedWindowRange): AnalysisTimeAssistedWindowRange {
  const span = range.toMs - range.fromMs;
  const padding = Math.max(ANALYSIS_TIME_ASSISTED_WINDOW_MIN_PADDING_MS, Math.round(span * ANALYSIS_TIME_ASSISTED_WINDOW_PADDING_FRACTION));
  return Object.freeze({ fromMs: range.fromMs - padding, toMs: range.toMs + padding });
}

/**
 * P22.5 window navigation: through the Gate474 seam it resolves the bound
 * chart and asks the vendor time scale for the padded interval. It owns no
 * estimate, marker, drawing or journal truth and changes no data.
 */
export function createAnalysisTimeAssistedWindowSession(): AnalysisTimeAssistedWindowSession {
  let active: { readonly binding: LightweightChartsV5DriverBinding; readonly handle: ChartEngineSeriesHandle } | null = null;
  let destroyed = false;
  return {
    lifecycle: {
      attach(binding, handle) {
        if (destroyed) throw new Error('analysis-time-assisted-window-session-destroyed');
        active = { binding, handle };
      },
      detach(handle) { if (active !== null && active.handle === handle) active = null; },
    },
    show(range) {
      if (destroyed) throw new Error('analysis-time-assisted-window-session-destroyed');
      if (!Number.isFinite(range.fromMs) || !Number.isFinite(range.toMs) || range.toMs < range.fromMs) return Object.freeze({ kind: 'invalid-range' as const });
      if (active === null) return Object.freeze({ kind: 'pending-chart' as const });
      const timeScale: unknown = active.binding.resolveChart(active.handle).timeScale();
      if (!hasVisibleRange(timeScale)) return Object.freeze({ kind: 'unsupported' as const });
      const requested = padTimeAssistedWindow(range);
      timeScale.setVisibleRange({ from: Math.floor(requested.fromMs / 1000), to: Math.ceil(requested.toMs / 1000) });
      return Object.freeze({ kind: 'shown' as const, requested, visible: null });
    },
    visibleRange() {
      if (destroyed || active === null) return null;
      const timeScale: unknown = active.binding.resolveChart(active.handle).timeScale();
      if (!hasVisibleRange(timeScale)) return null;
      const visible = timeScale.getVisibleRange?.() ?? null;
      return visible === null ? null : Object.freeze({ fromMs: visible.from * 1000, toMs: visible.to * 1000 });
    },
    destroy() { destroyed = true; active = null; },
  };
}
