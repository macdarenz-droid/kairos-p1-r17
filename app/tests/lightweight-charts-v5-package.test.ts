import { describe, expect, it } from 'vitest';
import {
  CandlestickSeries,
  LineSeries,
  createChart,
} from 'lightweight-charts';
import { lightweightChartsV5Package } from '../src/features/chart/lightweightChartsV5Package';

describe('P17.9 Lightweight Charts v5 package binding', () => {
  it('exposes the installed package through the existing injected module seam', () => {
    expect(lightweightChartsV5Package.createChart).toBe(createChart);
    expect(lightweightChartsV5Package.LineSeries).toBe(LineSeries);
    expect(lightweightChartsV5Package.CandlestickSeries).toBe(CandlestickSeries);
  });
});
