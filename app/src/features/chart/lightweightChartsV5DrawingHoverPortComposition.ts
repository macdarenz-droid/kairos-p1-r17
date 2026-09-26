import {
  createChartDrawingHoverPortFromDriver,
  type ChartDrawingHoverDriver,
  type ChartDrawingHoverPort,
} from './chartDrawingHoverPort';
import { createLightweightChartsV5DrawingHoverSubscriptionFromBinding } from './lightweightChartsV5DrawingHoverBindingComposition';
import type { LightweightChartsV5DriverBinding } from './lightweightChartsV5ModuleAdapter';

/**
 * P18.19 production drawing-hover port composition invariant:
 * - P18.18 remains the provider-neutral hover lifecycle owner
 * - P18.17 remains the provider chart-resolution/subscription/projection composition owner
 * - this boundary only adapts the P18.17 subscription lifecycle to P18.18's neutral driver contract
 * - provider subscribe/unsubscribe APIs are not reimplemented here
 * - neutral ChartEngineSeriesHandle remains free of provider APIs
 * - no click selection, drag/edit, drawing truth mutation, persistence, calculations,
 *   market acquisition, journal truth, toolbar state, navigation state, autoscale policy, or P19-phase behavior lives here
 */
export function createLightweightChartsV5DrawingHoverPort(
  binding: Pick<LightweightChartsV5DriverBinding, 'resolveChart'>,
): ChartDrawingHoverPort {
  const driver: ChartDrawingHoverDriver = {
    attach(series, drawings, onHover) {
      const subscription = createLightweightChartsV5DrawingHoverSubscriptionFromBinding(
        binding,
        series,
        drawings,
        onHover,
      );

      return {
        detach(): void {
          subscription.destroy();
        },
      };
    },
  };

  return createChartDrawingHoverPortFromDriver(driver);
}
