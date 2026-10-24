import type { LiveMarketSummaryBaselineAcquisitionPort } from '../../LiveMarketSummaryBaselineAcquisitionPort';
import {
  createBinanceSpot24hPublicRestBaselineAcquisitionPort,
  type BinanceSpot24hPublicRestBaselineObservedAtSource,
} from './binanceSpot24hPublicRestBaselineAcquisitionAdapter';
import {
  connectBinanceSpot24hBrowserPublicRestBaselineRequest,
} from './binanceSpot24hBrowserPublicRestBaselineConnector';

/**
 * Browser-ready binding for the released P21.13 acquisition adapter and
 * P21.14 browser connector. Observation time stays caller-owned so this
 * binding does not become a clock, freshness, scheduling, or state owner.
 */
export function createBinanceSpot24hBrowserPublicRestBaselineAcquisitionPort(
  readObservedAt: BinanceSpot24hPublicRestBaselineObservedAtSource,
): LiveMarketSummaryBaselineAcquisitionPort {
  return createBinanceSpot24hPublicRestBaselineAcquisitionPort(
    connectBinanceSpot24hBrowserPublicRestBaselineRequest,
    readObservedAt,
  );
}
