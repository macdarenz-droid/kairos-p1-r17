import { createContext, useContext, useEffect, useState } from 'react';
import type { PriceNowResult } from '../../application/market-reference/priceNow';
import type { MarketType } from '../../domain/trades';
import type { LiveMarketUniverseInstrumentMetadataFact } from '../../services/market-data/liveMarketUniverseInstrumentMetadataFact';

export type TradeFormMarketListResult =
  /** names: coin names by base asset (U14, D255), or null when there are none (not set up or unavailable). */
  | Readonly<{ ok: true; markets: readonly LiveMarketUniverseInstrumentMetadataFact[]; names: ReadonlyMap<string, string> | null }>
  | Readonly<{ ok: false }>;

/** What the trade form may ask the market for (U14). The app shell provides the real one; without it the form works offline as before. */
export interface TradeFormMarket {
  /** The markets the symbol search lists (searchableCryptoMarkets), from the device copy of the market list when it is fresh, with coin names when there are any. */
  readonly marketList: (signal: AbortSignal) => Promise<TradeFormMarketListResult>;
  /** The latest price for a typed market (D256); without it the form offers no "Price now". */
  readonly priceNow?: (ask: Readonly<{ marketType: MarketType; symbol: string }>, signal: AbortSignal) => Promise<PriceNowResult>;
}

export const TradeFormMarketContext = createContext<TradeFormMarket | null>(null);

export type TradeFormMarketListState =
  | Readonly<{ phase: 'absent' }>
  | Readonly<{ phase: 'waiting' }>
  | Readonly<{ phase: 'ready'; markets: readonly LiveMarketUniverseInstrumentMetadataFact[]; names: ReadonlyMap<string, string> | null }>
  | Readonly<{ phase: 'unavailable' }>;

/**
 * The market list for this form, read once when it is first `wanted` (the trader started typing a symbol), never
 * before: opening a form costs no request. 'absent' when no provider is there.
 */
export function useTradeFormMarketList(wanted: boolean): TradeFormMarketListState {
  const market = useContext(TradeFormMarketContext);
  const [state, setState] = useState<TradeFormMarketListState>({ phase: 'waiting' });
  const start = market !== null && wanted && state.phase === 'waiting';
  useEffect(() => {
    if (!start || market === null) return;
    const controller = new AbortController();
    market.marketList(controller.signal).then(
      result => { if (!controller.signal.aborted) setState(result.ok ? { phase: 'ready', markets: result.markets, names: result.names } : { phase: 'unavailable' }); },
      () => { if (!controller.signal.aborted) setState({ phase: 'unavailable' }); },
    );
    return () => controller.abort();
  }, [market, start]);
  // An unavailable list is asked again when the device is back online, so the note never outlives the reason.
  const unavailable = state.phase === 'unavailable';
  useEffect(() => {
    if (!unavailable) return;
    const again = () => setState({ phase: 'waiting' });
    window.addEventListener('online', again);
    return () => window.removeEventListener('online', again);
  }, [unavailable]);
  return market === null ? { phase: 'absent' } : state;
}
