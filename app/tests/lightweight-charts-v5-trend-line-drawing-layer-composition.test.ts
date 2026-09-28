import { describe, expect, it, vi } from 'vitest';
import {
  createLightweightChartsV5DriverBinding,
  createLightweightChartsV5TrendLineDrawingLayerPort,
  type LightweightChartsV5Module,
} from '../src/features/chart';

function createModule() {
  const attached: unknown[] = [];
  const detached: unknown[] = [];
  const series = {
    setData: vi.fn(), update: vi.fn(), priceToCoordinate: (price: number) => price * 2,
    attachPrimitive: (primitive: unknown) => attached.push(primitive),
    detachPrimitive: (primitive: unknown) => detached.push(primitive),
  };
  const chart = {
    timeScale: () => ({
      getVisibleLogicalRange: () => null,
      subscribeVisibleLogicalRangeChange: vi.fn(), unsubscribeVisibleLogicalRangeChange: vi.fn(),
      timeToCoordinate: (time: unknown) => typeof time === 'number' ? time : null,
    }),
    addSeries: () => series, removeSeries: vi.fn(), remove: vi.fn(),
  };
  const module: LightweightChartsV5Module = {
    createChart: () => chart,
    LineSeries: { __kairosSeriesData: undefined },
    CandlestickSeries: { __kairosSeriesData: undefined },
  };
  return { module, attached, detached };
}

describe('P18.10 Lightweight Charts v5 trend-line drawing-layer composition', () => {
  it('wires the neutral drawing-layer port to the provider series and P18.8 primitive factory', () => {
    const { module, attached } = createModule();
    const binding = createLightweightChartsV5DriverBinding(module);
    const chart = binding.driver.createChart(document.createElement('div'));
    const handle = chart.addPriceLineSeries();
    const layer = createLightweightChartsV5TrendLineDrawingLayerPort(binding, { color: '#fff', lineWidth: 2 });
    const session = layer.attach(handle);
    session.replaceDrawings([]);
    expect(attached).toHaveLength(1);
  });

  it('preserves P18.4 replacement semantics by detaching the previous primitive first', () => {
    const { module, attached, detached } = createModule();
    const binding = createLightweightChartsV5DriverBinding(module);
    const chart = binding.driver.createChart(document.createElement('div'));
    const handle = chart.addCandlestickSeries();
    const session = createLightweightChartsV5TrendLineDrawingLayerPort(binding, { color: '#0f0', lineWidth: 1 }).attach(handle);
    session.replaceDrawings([]);
    session.replaceDrawings([]);
    expect(attached).toHaveLength(2);
    expect(detached).toEqual([attached[0]]);
  });

  it('detaches the active provider primitive exactly once when the neutral session is destroyed', () => {
    const { module, attached, detached } = createModule();
    const binding = createLightweightChartsV5DriverBinding(module);
    const chart = binding.driver.createChart(document.createElement('div'));
    const handle = chart.addPriceLineSeries();
    const session = createLightweightChartsV5TrendLineDrawingLayerPort(binding, { color: '#fff', lineWidth: 2 }).attach(handle);
    session.replaceDrawings([]);
    session.destroy(); session.destroy();
    expect(detached).toEqual([attached[0]]);
  });

  it('fails closed when a resolved provider series does not expose primitive lifecycle methods', () => {
    const module: LightweightChartsV5Module = {
      createChart: () => ({
        timeScale: () => ({
          getVisibleLogicalRange: () => null,
          subscribeVisibleLogicalRangeChange: vi.fn(), unsubscribeVisibleLogicalRangeChange: vi.fn(),
        }),
        addSeries: () => ({ setData: vi.fn(), update: vi.fn() }),
        removeSeries: vi.fn(), remove: vi.fn(),
      }),
      LineSeries: { __kairosSeriesData: undefined },
      CandlestickSeries: { __kairosSeriesData: undefined },
    };
    const binding = createLightweightChartsV5DriverBinding(module);
    const chart = binding.driver.createChart(document.createElement('div'));
    const handle = chart.addPriceLineSeries();
    const layer = createLightweightChartsV5TrendLineDrawingLayerPort(binding, { color: '#fff', lineWidth: 2 });
    expect(() => layer.attach(handle)).toThrow('lightweight-charts-series-primitive-api-unavailable');
  });

});
