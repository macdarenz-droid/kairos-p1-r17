import type {
  ChartVisibleLogicalRangeListener,
  ChartVisibleTimeRangePort,
} from './chartVisibleRange';
import type {
  LightweightChartsV5ChartApi,
  LightweightChartsV5LogicalRangeChangeHandler,
} from './lightweightChartsV5ModuleAdapter';

export function createLightweightChartsV5VisibleRangePort(
  chart: LightweightChartsV5ChartApi,
): ChartVisibleTimeRangePort {
  const timeScale = chart.timeScale();

  return {
    getVisibleLogicalRange() {
      return timeScale.getVisibleLogicalRange();
    },

    setVisibleTimeRange(range) {
      if (typeof timeScale.setVisibleRange !== 'function') return false;
      if (!Number.isFinite(range.fromMs) || !Number.isFinite(range.toMs) || range.toMs <= range.fromMs) return false;
      timeScale.setVisibleRange({ from: Math.floor(range.fromMs / 1000), to: Math.ceil(range.toMs / 1000) });
      return true;
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
