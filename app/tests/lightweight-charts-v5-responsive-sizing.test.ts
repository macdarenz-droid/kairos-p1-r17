import { describe, expect, it, vi } from 'vitest';
import { createLightweightChartsV5Driver, type LightweightChartsV5Module } from '../src/features/chart/lightweightChartsV5ModuleAdapter';

describe('P17.11 responsive chart sizing boundary', () => {
  it('keeps generic driver sizing-neutral', () => {
    const createChart = vi.fn(() => ({ addSeries: vi.fn(), removeSeries: vi.fn(), remove: vi.fn() }));
    const module = { createChart, LineSeries: {}, CandlestickSeries: {} } as unknown as LightweightChartsV5Module;
    createLightweightChartsV5Driver(module).createChart(document.createElement('div'));
    expect(createChart).toHaveBeenCalledWith(expect.any(HTMLElement));
  });
});
