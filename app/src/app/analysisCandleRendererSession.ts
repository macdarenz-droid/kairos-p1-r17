import { getChartTheme, type ThemeId } from '../design-system/themes';
import {
  createLightweightChartsV5ProductionRendererFactory,
  type PresentedChartRenderer,
} from '../features/chart/lightweightChartsV5ProductionRenderer';
import type { ChartVisibleTimeRange } from '../features/chart';
import type { MarketCandle, MarketCandleHistorySnapshot } from '../services/market-data/MarketCandleHistoryPort';

export interface AnalysisCandleRendererFactory {
  create(container: HTMLElement): PresentedChartRenderer;
}

export interface AnalysisCandleRendererSessionInput {
  readonly container: HTMLElement;
  readonly snapshot: MarketCandleHistorySnapshot;
  readonly themeId: ThemeId;
  readonly factory?: AnalysisCandleRendererFactory;
  /** First view to show instead of the latest 80 candles, used only when it overlaps the loaded candles. */
  readonly initialWindow?: ChartVisibleTimeRange;
}

export const ANALYSIS_DEFAULT_RECENT_CANDLES = 80;

/** True when the window shares time with the loaded candles, from the first open to the last close. */
export function timeWindowOverlapsCandles(window: ChartVisibleTimeRange, candles: readonly MarketCandle[]): boolean {
  const first = candles[0], last = candles.at(-1);
  if (!first || !last) return false;
  const fromMs = Date.parse(first.openTime), toMs = Date.parse(last.closeTime);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return false;
  return window.fromMs <= toMs && window.toMs >= fromMs;
}

/**
 * Synchronously renders one caller-authoritative Analysis history snapshot and
 * returns that exact production renderer for subsequent caller-owned live
 * candle updates and viewport controls.
 */
export function createAnalysisCandleRendererSession({
  container,
  snapshot,
  themeId,
  factory = createLightweightChartsV5ProductionRendererFactory(),
  initialWindow,
}: AnalysisCandleRendererSessionInput): PresentedChartRenderer {
  const session = factory.create(container);
  try {
    session.setTheme(getChartTheme(themeId));
    session.render({
      market: {
        venue: snapshot.request.instrument.venue,
        instrument: snapshot.request.instrument.symbol,
        source: snapshot.source,
      },
      series: { kind: 'candles', candles: snapshot.candles },
      journalExecutions: [],
    });
    // The first view is applied after render, so nothing in render (range events included) can override it.
    const showedWindow = initialWindow !== undefined
      && timeWindowOverlapsCandles(initialWindow, snapshot.candles)
      && session.showTimeRange?.(initialWindow) === true;
    if (!showedWindow) session.showRecent(ANALYSIS_DEFAULT_RECENT_CANDLES);
    return session;
  } catch (error) {
    session.destroy();
    throw error;
  }
}
