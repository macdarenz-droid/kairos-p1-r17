import { describeMarketDataUnavailable } from '../application/online/onlineWords';
import type { MarketDataConnectionState } from '../services/market-data/marketDataTypes';
import type { BinanceAnalysisLiveCandleBrowserAvailability } from './binanceAnalysisLiveCandleBrowserAvailabilityLifecycle';
import type { BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleResult } from './binanceAnalysisLiveCandleBrowserAvailabilityLifecycle';
import type { BinanceAnalysisLiveCandleDisposition } from './binanceAnalysisLiveCandleProjectionRendererCoordination';
import type { BinanceAnalysisLiveCandleGapBackfillRecoveryResult } from './binanceAnalysisLiveCandleGapBackfillRecoveryCoordination';

export type AnalysisLiveCandleStatusKind =
  | 'loading'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'recovering'
  | 'paused-hidden'
  | 'paused-offline'
  | 'empty'
  | 'unavailable'
  | 'error';

export interface AnalysisLiveCandleStatusPresentationInput {
  readonly availability: BinanceAnalysisLiveCandleBrowserAvailability | null;
  readonly activation: BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleResult | null;
  readonly connection: MarketDataConnectionState | null;
  readonly disposition: BinanceAnalysisLiveCandleDisposition | null;
  readonly backfillRecovery: BinanceAnalysisLiveCandleGapBackfillRecoveryResult | null;
  readonly lastError: unknown | null;
  /** U10 (D234): the pair (EUR/USD) when the chart is OANDA forex, read again every 30 seconds; null or absent for Binance. */
  readonly forexPair?: string | null;
}

export interface AnalysisLiveCandleStatusPresentation {
  readonly kind: AnalysisLiveCandleStatusKind;
  readonly label: string;
  readonly detail: string;
}

const status = (
  kind: AnalysisLiveCandleStatusKind,
  label: string,
  detail: string,
): AnalysisLiveCandleStatusPresentation => Object.freeze({ kind, label, detail });

/** The forex chart's words (D234): it reads OANDA's candles again every 30 seconds, so it never says "live". */
const FOREX = Object.freeze({
  'paused-hidden': status('paused-hidden', 'Updates paused', 'Return to this tab to read the newest candles.'),
  'paused-offline': status('paused-offline', 'Updates paused', 'Reconnect to the internet to read the newest candles.'),
  loading: status('loading', 'Loading candles', "Kairos is reading OANDA's candles."),
  recovering: status('recovering', 'Refreshing candles', 'Kairos is reading the newest candles again.'),
  error: status('error', 'Updates stopped', 'The chart keeps the candles it has. Tap "Refresh candles" to read them again.'),
  live: status('live', 'Updates every 30 seconds', "Kairos reads OANDA's newest candles again every 30 seconds while this page is open and you're online."),
  reconnecting: status('reconnecting', 'Update missed', 'Kairos tries again in 30 seconds.'),
});

const activationFailure = (
  result: Extract<BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleResult, { readonly ok: false }>,
  forexPair: string | null,
): AnalysisLiveCandleStatusPresentation => {
  if (result.reason === 'browser-unavailable') {
    if (forexPair !== null) return result.availability === 'hidden' ? FOREX['paused-hidden'] : FOREX['paused-offline'];
    return result.availability === 'hidden'
      ? status('paused-hidden', 'Live candles paused', 'Return to this tab to reacquire current candles.')
      : status('paused-offline', 'Live candles paused', 'Reconnect to the internet to reacquire current candles.');
  }
  if (result.reason === 'superseded') {
    if (forexPair !== null) return FOREX.loading;
    return status('loading', 'Loading candles', 'Waiting for the latest chart selection.');
  }
  if (result.reason === 'history-empty') {
    return status('empty', 'No candles returned', 'No authoritative candles are available for this selection.');
  }
  if (result.reason === 'history-failed') {
    if (result.failure.reason === 'unavailable') {
      return status('unavailable', 'Candles unavailable', describeMarketDataUnavailable(result.failure, 'Candles', forexPair === null ? undefined : { provider: 'oanda', pair: forexPair }).message);
    }
    if (result.failure.reason === 'http-error') {
      if (result.failure.status === 429 || result.failure.status === 418) {
        return status('unavailable', 'Candles temporarily unavailable', 'The market-data service is limiting requests. Try again later.');
      }
      if (result.failure.status === 403 || result.failure.status === 451) {
        return status('unavailable', 'Candles unavailable', 'Binance Spot data is unavailable from this connection or region.');
      }
    }
    return status('unavailable', 'Candles unavailable', 'Authoritative candle history could not be loaded.');
  }
  if (result.reason === 'history-scope-mismatch') {
    return status('error', 'Chart scope rejected', 'Returned candle history did not match the selected market and timeframe.');
  }
  if (result.reason === 'renderer-failed') {
    return status('error', 'Chart unavailable', 'The candle chart could not be displayed on this device.');
  }
  return status('error', 'Live candles unavailable', 'The selected live-candle session could not be started.');
};

/**
 * Projects released raw lifecycle evidence into truthful, provider-aware copy.
 * It never manufactures a live claim: only the exact `live` connection state
 * may produce the live presentation.
 */
export function presentAnalysisLiveCandleStatus({
  availability,
  activation,
  connection,
  disposition,
  backfillRecovery,
  lastError,
  forexPair = null,
}: AnalysisLiveCandleStatusPresentationInput): AnalysisLiveCandleStatusPresentation {
  if (forexPair !== null) return presentForexStatus({ availability, activation, connection, disposition, backfillRecovery, lastError }, forexPair);
  if (availability === 'hidden') {
    return status('paused-hidden', 'Live candles paused', 'Return to this tab to reacquire current candles.');
  }
  if (availability === 'offline') {
    return status('paused-offline', 'Live candles paused', 'Reconnect to the internet to reacquire current candles.');
  }
  if (activation === null) {
    return status('loading', 'Loading candles', 'Loading authoritative history before live updates start.');
  }
  if (!activation.ok) return activationFailure(activation, null);
  if (backfillRecovery && !backfillRecovery.ok) {
    return status('unavailable', 'Candle recovery failed', 'Authoritative history could not restore the selected live chart.');
  }
  if (disposition?.kind === 'backfill-required' && backfillRecovery === null) {
    return status('recovering', 'Refreshing candles', 'Reacquiring authoritative history before live updates resume.');
  }
  if (lastError !== null || connection === 'error') {
    return status('error', 'Live candle connection error', 'The chart remains read-only while live updates are unavailable.');
  }
  if (connection === 'live') {
    return status('live', 'Live candles connected', 'Validated market updates are being applied to this chart.');
  }
  if (connection === 'disconnected') {
    return status('reconnecting', 'Reconnecting live candles', "Kairos keeps trying while this page is open and you're online.");
  }
  return status('connecting', 'Connecting live candles', 'Authoritative history is loaded; waiting for validated market updates.');
}

/** The same evidence as presentAnalysisLiveCandleStatus, in the forex chart's words (D234). */
function presentForexStatus(
  { availability, activation, connection, disposition, backfillRecovery, lastError }: AnalysisLiveCandleStatusPresentationInput,
  forexPair: string,
): AnalysisLiveCandleStatusPresentation {
  if (availability === 'hidden') return FOREX['paused-hidden'];
  if (availability === 'offline') return FOREX['paused-offline'];
  if (activation === null) return FOREX.loading;
  if (!activation.ok) return activationFailure(activation, forexPair);
  if (backfillRecovery && !backfillRecovery.ok) {
    return status('unavailable', 'Candle refresh failed', 'Kairos could not read the newest candles again. Tap "Refresh candles".');
  }
  if (disposition?.kind === 'backfill-required' && backfillRecovery === null) return FOREX.recovering;
  if (lastError !== null || connection === 'error') return FOREX.error;
  if (connection === 'disconnected') return FOREX.reconnecting;
  if (connection === 'live') return FOREX.live;
  return FOREX.loading;
}
