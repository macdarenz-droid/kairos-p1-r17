import {
  CandlestickSeries,
  LineSeries,
  createChart,
} from 'lightweight-charts';
import type { LightweightChartsV5Module } from './lightweightChartsV5ModuleAdapter';

/**
 * Production package boundary for Lightweight Charts v5.
 *
 * P17.6/P17.8 retain ownership of the Kairos-facing API shape and behavior.
 * This module only binds the installed browser package to that already-tested
 * injected module contract. No feed, persistence, calculation, or drawing
 * ownership is introduced here.
 */
export const lightweightChartsV5Package: LightweightChartsV5Module = {
  createChart,
  LineSeries,
  CandlestickSeries,
} as unknown as LightweightChartsV5Module;
