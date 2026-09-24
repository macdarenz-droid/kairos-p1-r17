import type {
  ChartVisibleRangePort,
  ChartVisibleLogicalRangeListener,
} from './chartVisibleRange';
import type {
  LightweightChartsV5ChartApi,
  LightweightChartsV5LogicalRangeChangeHandler,
} from './lightweightChartsV5ModuleAdapter';

export function createLightweightChartsV5VisibleRangePort(
  chart: LightweightChartsV5ChartApi,
): ChartVisibleRangePort {
  const timeScale = chart.timeScale();

  return {
    getVisibleLogicalRange() {
      return timeScale.getVisibleLogicalRange();
    },

    subscribeVisibleLogicalRangeChange(
      listener: ChartVisibleLogicalRangeListener,
    ) {
      const handler: LightweightChartsV5LogicalRangeChangeHandler = (range) => {
        listener(range);
      };
      let active = true;

      timeScale.subscribeVisibleLogicalRangeChange(handler);

      return () => {
        if (!active) return;
        active = false;
        timeScale.unsubscribeVisibleLogicalRangeChange(handler);
      };
    },
  };
}
