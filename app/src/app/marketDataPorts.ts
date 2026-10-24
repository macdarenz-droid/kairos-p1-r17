/**
 * U2 (D155): the one place that picks the market data provider for the whole build. With a valid VITE_KAIROS_API_URL
 * the app asks the Kairos server (services/kairos-api/marketApi.ts); without one it keeps today's direct Binance path,
 * wrapped only so every failure says why (`why`). Application code sees port types only (D31).
 */
import { kairosRepositories } from '../data/repositories';
import { ActivationReceiptRepository } from '../services/activation';
import type { ActivationReceipt } from '../services/activation/activationTypes';
import { createKairosApiClient, parseKairosApiBaseUrl, storedReceiptReader } from '../services/kairos-api/kairosApi';
import { browserMarketListStore, createKairosMarketDataPorts, type MarketListStore } from '../services/kairos-api/marketApi';
import type { LiveMarketSummaryBaselineAcquisitionPort } from '../services/market-data/LiveMarketSummaryBaselineAcquisitionPort';
import type { LiveMarketUniverseInstrumentMetadataAcquisitionPort } from '../services/market-data/LiveMarketUniverseInstrumentMetadataAcquisitionPort';
import type { MarketCandleHistoryPort, MarketCandleHistoryResult } from '../services/market-data/MarketCandleHistoryPort';
import type { MarketDataUnavailable, MarketDataUnavailableWhy } from '../services/market-data/marketDataTypes';
import { createBinanceSpot24hBrowserPublicRestBaselineAcquisitionPort } from '../services/market-data/providers/binance/binanceSpot24hBrowserPublicRestBaselineAcquisitionBinding';
import { createBinanceSpotCandleHistoryPort } from '../services/market-data/providers/binance/binanceSpotCandleHistoryAcquisition';
import { connectBinanceSpotCandleHistoryBrowser } from '../services/market-data/providers/binance/binanceSpotCandleHistoryBrowserConnector';
import { createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort } from '../services/market-data/providers/binance/binanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionBinding';

export interface MarketDataPortSet {
  readonly history: MarketCandleHistoryPort;
  readonly metadata: LiveMarketUniverseInstrumentMetadataAcquisitionPort;
  readonly baseline: LiveMarketSummaryBaselineAcquisitionPort;
}

export interface AppMarketDataPorts extends MarketDataPortSet {
  readonly route: 'server' | 'direct';
}

export interface ChooseMarketDataPortsOptions {
  readonly baseUrl: string | null;
  readonly readReceipt?: () => Promise<ActivationReceipt | null>;
  readonly fetchImpl?: typeof fetch;
  readonly store?: MarketListStore | null;
  readonly direct: MarketDataPortSet;
}

export function chooseMarketDataPorts({ baseUrl, readReceipt, fetchImpl, store = null, direct }: ChooseMarketDataPortsOptions): AppMarketDataPorts {
  if (baseUrl === null) return Object.freeze({ route: 'direct' as const, ...withTypedFailures(direct) });
  const client = createKairosApiClient({ baseUrl, readReceipt, fetchImpl });
  return Object.freeze({ route: 'server' as const, ...createKairosMarketDataPorts(client, { store }) });
}

const unavailable = (why: MarketDataUnavailableWhy, retryAfterSeconds: number | null = null): MarketDataUnavailable =>
  Object.freeze({ ok: false as const, reason: 'unavailable' as const, why, retryAfterSeconds });

/** A Retry-After of whole seconds, else null. */
const wholeSeconds = (retryAfter: string | null): number | null =>
  retryAfter !== null && /^[0-9]{1,6}$/.test(retryAfter.trim()) ? parseInt(retryAfter.trim(), 10) : null;

/** The direct Binance path's failures, typed: what each one means for the trader. */
export function withTypedFailures(ports: MarketDataPortSet, isOnline: () => boolean = () => globalThis.navigator?.onLine !== false): MarketDataPortSet {
  const connectionLost = () => unavailable(isOnline() ? 'source-down' : 'offline');
  const typed = (result: MarketCandleHistoryResult): MarketCandleHistoryResult => {
    if (result.ok) return result;
    switch (result.reason) {
      case 'http-error':
        if (result.status === 451 || result.status === 403) return unavailable('region');
        if (result.status === 429 || result.status === 418) return unavailable('busy', wholeSeconds(result.retryAfter));
        return unavailable('source-down');
      case 'transport-failed': return connectionLost();
      case 'invalid-response':
      case 'observed-at-invalid': return unavailable('unreadable');
      default: return result;
    }
  };
  const history: MarketCandleHistoryPort = { acquireHistory: async (request, options) => typed(await ports.history.acquireHistory(request, options)) };
  const metadata: LiveMarketUniverseInstrumentMetadataAcquisitionPort = {
    async acquireInstrumentMetadata(options) {
      const result = await ports.metadata.acquireInstrumentMetadata(options);
      return !result.ok && result.reason === 'acquisition-failed' ? connectionLost() : result;
    },
  };
  const baseline: LiveMarketSummaryBaselineAcquisitionPort = {
    async acquireBaseline(scope, options) {
      const result = await ports.baseline.acquireBaseline(scope, options);
      return !result.ok && result.reason === 'acquisition-failed' ? connectionLost() : result;
    },
  };
  return Object.freeze({ history, metadata, baseline });
}

let appPorts: AppMarketDataPorts | null = null;

/** The build's market data ports, created once and shared by every screen. */
export function appMarketDataPorts(): AppMarketDataPorts {
  if (appPorts !== null) return appPorts;
  appPorts = chooseMarketDataPorts({
    baseUrl: parseKairosApiBaseUrl(import.meta.env.VITE_KAIROS_API_URL),
    readReceipt: storedReceiptReader(new ActivationReceiptRepository(kairosRepositories.metadata)),
    store: browserMarketListStore(),
    direct: {
      history: createBinanceSpotCandleHistoryPort(connectBinanceSpotCandleHistoryBrowser, () => new Date().toISOString()),
      metadata: createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort(),
      baseline: createBinanceSpot24hBrowserPublicRestBaselineAcquisitionPort(() => new Date().toISOString()),
    },
  });
  return appPorts;
}
