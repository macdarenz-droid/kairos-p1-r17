import type { ChartRenderModel } from './chartRenderContract';

export interface ChartRendererLifecycle {
  render(model: ChartRenderModel): void;
  destroy(): void;
}

export interface ChartRendererFactory {
  create(container: HTMLElement): ChartRendererLifecycle;
}

/**
 * P17 renderer lifecycle invariant:
 * - renderer implementations consume already-authoritative ChartRenderModel input
 * - render() is presentation-only and must not mutate source truth
 * - destroy() releases renderer-owned resources only
 * - no renderer may own persistence, market subscriptions, calculations, or journal state
 */
export function defineChartRendererFactory(
  factory: ChartRendererFactory,
): ChartRendererFactory {
  return factory;
}
