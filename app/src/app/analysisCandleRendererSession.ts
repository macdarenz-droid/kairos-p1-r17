import { getChartTheme, type ThemeId } from '../design-system/themes';
import {
  createLightweightChartsV5ProductionRendererFactory,
  type PresentedChartRenderer,
} from '../features/chart/lightweightChartsV5ProductionRenderer';
import type { MarketCandleHistorySnapshot } from '../services/market-data/MarketCandleHistoryPort';

export interface AnalysisCandleRendererFactory {
  create(container: HTMLElement): PresentedChartRenderer;
}

export interface AnalysisCandleRendererSessionInput {
  readonly container: HTMLElement;
  readonly snapshot: MarketCandleHistorySnapshot;
  readonly themeId: ThemeId;
  readonly factory?: AnalysisCandleRendererFactory;
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
    session.showRecent(80);
    return session;
  } catch (error) {
    session.destroy();
    throw error;
  }
}
