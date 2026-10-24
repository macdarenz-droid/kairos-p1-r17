import { createContext, useContext, useEffect, useState } from 'react';
import type { MarketMinute } from '../../application/market-reference/minuteCheck';
import type { PriceNowResult } from '../../application/market-reference/priceNow';
import type { MarketType } from '../../domain/trades';
import type { LiveMarketUniverseInstrumentMetadataFact } from '../../services/market-data/liveMarketUniverseInstrumentMetadataFact';

export type TradeFormMarketListResult =
  | Readonly<{ ok: true; markets: readonly LiveMarketUniverseInstrumentMetadataFact[] }>
  | Readonly<{ ok: false }>;

/** What the trade form may ask the market for (U14). The app shell provides the real one; without it the form works offline as before. */
export interface TradeFormMarket {
  /** The markets the symbol search lists (searchableCryptoMarkets), from the device copy of the market list when it is fresh. */
  readonly marketList: (signal: AbortSignal) => Promise<TradeFormMarketListResult>;
  /**
   * Coin names by base asset (D255), or null when there are none (not set up or unavailable). Read beside the list,
   * never before it: names are a help, never a condition.
   */
  readonly coinNames?: (signal: AbortSignal) => Promise<ReadonlyMap<string, string> | null>;
  /** The latest price for a typed market (D256); without it the form offers no "Price now". */
  readonly priceNow?: (ask: Readonly<{ marketType: MarketType; symbol: string }>, signal: AbortSignal) => Promise<PriceNowResult>;
  /** The 1-minute candle that holds a time (D257); without it the form offers no minute check and no "Typo?". */
  readonly minute?: (ask: Readonly<{ marketType: MarketType; symbol: string; at: string }>, signal: AbortSignal) => Promise<MarketMinute>;
}

export const TradeFormMarketContext = createContext<TradeFormMarket | null>(null);

export type TradeFormMarketListState =
  | Readonly<{ phase: 'absent' }>
  | Readonly<{ phase: 'waiting' }>
  | Readonly<{ phase: 'ready'; markets: readonly LiveMarketUniverseInstrumentMetadataFact[]; names: ReadonlyMap<string, string> | null }>
  | Readonly<{ phase: 'unavailable' }>;

type ListRead = Exclude<TradeFormMarketListState, { phase: 'absent' | 'ready' }> | Readonly<{ phase: 'ready'; markets: readonly LiveMarketUniverseInstrumentMetadataFact[] }>;

/**
 * The market list for this form, read once when it is first `wanted` (the trader started typing a symbol), never
 * before: opening a form costs no request. Coin names are read beside it and join it when they arrive. 'absent' when no
 * provider is there.
 */
export function useTradeFormMarketList(wanted: boolean): TradeFormMarketListState {
  const market = useContext(TradeFormMarketContext);
  const [state, setState] = useState<ListRead>({ phase: 'waiting' });
  const start = market !== null && wanted && state.phase === 'waiting';
  // undefined until the names answer: the list never waits for them.
  const [names, setNames] = useState<ReadonlyMap<string, string> | null | undefined>(undefined);
  const askNames = market?.coinNames !== undefined && wanted && names === undefined;
  useEffect(() => {
    if (!askNames || market?.coinNames === undefined) return;
    const controller = new AbortController();
    market.coinNames(controller.signal).then(
      found => { if (!controller.signal.aborted) setNames(found); },
      () => { if (!controller.signal.aborted) setNames(null); },
    );
    return () => controller.abort();
  }, [market, askNames]);
  useEffect(() => {
    if (!start || market === null) return;
    const controller = new AbortController();
    market.marketList(controller.signal).then(
      result => { if (!controller.signal.aborted) setState(result.ok ? { phase: 'ready', markets: result.markets } : { phase: 'unavailable' }); },
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
  if (market === null) return { phase: 'absent' };
  return state.phase === 'ready' ? { ...state, names: names ?? null } : state;
}
