import { createContext } from 'react';
import type { ChartVisibleTimeRange } from '../features/chart';
import type { AnalysisLiveCandleReactBindingOptions } from './useAnalysisLiveCandleRouteSession';
import type { AnalysisSavedTradeOverlayReactBindingOptions } from './useAnalysisSavedTradeOverlayPresentationSession';

/**
 * Optional released overlay session factory supplied by a higher composition
 * (the Analysis workspace's drawing tools). The overlay canvas reads it as the
 * default for its React binding so its released mount literal stays unchanged.
 * Null means the released default overlay session.
 */
export const AnalysisOverlaySessionFactoryContext = createContext<AnalysisSavedTradeOverlayReactBindingOptions['createSession'] | null>(null);

/**
 * Optional released route-session factory for the base live canvas, supplied by
 * the same higher composition. The live canvas reads it as the default for its
 * React binding; it never constructs the route session itself.
 */
export const AnalysisLiveSessionFactoryContext = createContext<AnalysisLiveCandleReactBindingOptions['createSession'] | null>(null);

/**
 * Optional first view for the saved-trade chart: the trade's time window.
 * The overlay canvas passes it to the renderer session, which shows it instead
 * of the latest candles when it overlaps them. Null means the latest candles.
 */
export const AnalysisTradeWindowContext = createContext<ChartVisibleTimeRange | null>(null);
