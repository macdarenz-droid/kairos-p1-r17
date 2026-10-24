/**
 * U14 (D254): the one owner of searching markets by what a trader types: Binance's market list for crypto, the
 * standard forex pairs and the two main metals for forex. It only filters and orders; nothing is fetched here.
 */
import { normalizeTradeSymbol, type MarketType } from '../../domain/trades';
import type { LiveMarketUniverseInstrumentMetadataFact } from '../../services/market-data/liveMarketUniverseInstrumentMetadataFact';
import { FOREX_MAJOR_CURRENCIES } from '../markets/forexPair';
import { matchCryptoMarket } from './cryptoMarket';

/** What the search needs from a crypto market: its symbol and its two assets. */
export interface CryptoMarketOption {
  readonly instrument: { readonly symbol: string };
  readonly baseAsset: string;
  readonly quoteAsset: string;
}

export const SYMBOL_SEARCH_MAX_RESULTS = 50;

/** Longest first, so ".PERP" goes before ".P". */
const PERPETUAL_MARKS = ['.PERP', '-PERP', '_PERP', '.P'] as const;

/** Upper case without spaces, separators or a perpetual mark; XBT is Bitcoin's other code (as matchCryptoMarket reads it). */
function needleOf(query: string): string {
  let text = query.trim().toUpperCase().replace(/\s+/g, '');
  const mark = PERPETUAL_MARKS.find(candidate => text.length > candidate.length && text.endsWith(candidate));
  if (mark) text = text.slice(0, -mark.length);
  text = text.replace(/[/\-_:.]/g, '');
  return text.startsWith('XBT') ? `BTC${text.slice(3)}` : text;
}

/** USDT pairs A→Z first, then every other pair A→Z; at most 50, matched by symbol, base and quote, or a coin's name. */
export function filterCryptoMarkets<T extends CryptoMarketOption>(
  facts: readonly T[],
  query: string,
  names: ReadonlyMap<string, string> | null = null,
): readonly T[] {
  const needle = needleOf(query);
  const words = query.trim().toUpperCase();
  const named = (fact: T) => {
    const name = names?.get(fact.baseAsset.toUpperCase());
    return name !== undefined && words.length >= 2 && name.toUpperCase().includes(words);
  };
  const matches = facts.filter(fact => needle === ''
    || fact.instrument.symbol.toUpperCase().includes(needle)
    || `${fact.baseAsset}${fact.quoteAsset}`.toUpperCase().includes(needle)
    || named(fact));
  const bySymbol = (a: T, b: T) => a.instrument.symbol.localeCompare(b.instrument.symbol);
  const usdt = matches.filter(fact => fact.quoteAsset === 'USDT').sort(bySymbol);
  const others = matches.filter(fact => fact.quoteAsset !== 'USDT').sort(bySymbol);
  return [...usdt, ...others].slice(0, SYMBOL_SEARCH_MAX_RESULTS);
}

/** Plain names of the eight major currencies and the two metals Kairos lists. */
const FOREX_NAMES: Readonly<Record<string, string>> = Object.freeze({
  EUR: 'Euro', GBP: 'British pound', AUD: 'Australian dollar', NZD: 'New Zealand dollar', USD: 'US dollar',
  CAD: 'Canadian dollar', CHF: 'Swiss franc', JPY: 'Japanese yen', XAU: 'Gold', XAG: 'Silver',
});

export interface ForexMarketOption {
  /** Six letters, as the trade keeps it: 'EURUSD'. */
  readonly symbol: string;
  readonly base: string;
  readonly quote: string;
  /** 'EUR/USD'. */
  readonly label: string;
  /** 'Euro / US dollar'. */
  readonly name: string;
}

const forexOption = (base: string, quote: string): ForexMarketOption => Object.freeze({
  symbol: `${base}${quote}`, base, quote, label: `${base}/${quote}`, name: `${FOREX_NAMES[base]} / ${FOREX_NAMES[quote]}`,
});

/** The 28 standard pairs of the eight majors, in the market's quoting order, then gold and silver against the dollar. */
export const FOREX_MARKET_OPTIONS: readonly ForexMarketOption[] = Object.freeze([
  ...FOREX_MAJOR_CURRENCIES.flatMap((base, index) => FOREX_MAJOR_CURRENCIES.slice(index + 1).map(quote => forexOption(base, quote))),
  forexOption('XAU', 'USD'),
  forexOption('XAG', 'USD'),
]);

/** Forex pairs by their letters or their currencies' names, in the list's order. */
export function filterForexMarkets(query: string): readonly ForexMarketOption[] {
  const needle = needleOf(query);
  const words = query.trim().toUpperCase();
  return FOREX_MARKET_OPTIONS.filter(option => needle === '' || option.symbol.includes(needle)
    || (words.length >= 2 && option.name.toUpperCase().includes(words))).slice(0, SYMBOL_SEARCH_MAX_RESULTS);
}

export interface SymbolSearchRow {
  readonly symbol: string;
  readonly marketType: 'crypto' | 'forex';
  /** What the row says: 'BTCUSDT · BTC/USDT', 'BTCUSDT · Bitcoin', 'EUR/USD · Euro / US dollar'. */
  readonly label: string;
  /** The currency its prices are in. */
  readonly quoteAsset: string;
}

/**
 * The rows for the trade form's symbol search. A chosen market narrows the lists: crypto searches Binance's list,
 * forex the pairs; with no market yet both show, crypto first. Stocks and the other markets have no list (D233).
 */
export function searchMarketSymbols(
  query: string,
  lists: Readonly<{ marketType: MarketType | ''; crypto: readonly CryptoMarketOption[]; names?: ReadonlyMap<string, string> | null }>,
): readonly SymbolSearchRow[] {
  const { marketType, crypto, names = null } = lists;
  const rows: SymbolSearchRow[] = [];
  if (marketType === '' || marketType === 'crypto') {
    for (const fact of filterCryptoMarkets(crypto, query, names)) {
      const name = names?.get(fact.baseAsset.toUpperCase());
      rows.push(Object.freeze({
        symbol: fact.instrument.symbol, marketType: 'crypto' as const, quoteAsset: fact.quoteAsset,
        label: `${fact.instrument.symbol} · ${name ?? `${fact.baseAsset}/${fact.quoteAsset}`}`,
      }));
    }
  }
  if (marketType === '' || marketType === 'forex') {
    for (const option of filterForexMarkets(query)) {
      rows.push(Object.freeze({ symbol: option.symbol, marketType: 'forex' as const, quoteAsset: option.quote, label: `${option.label} · ${option.name}` }));
    }
  }
  return Object.freeze(rows.slice(0, SYMBOL_SEARCH_MAX_RESULTS));
}

/** The markets a trader can search: Binance Spot markets open for trading, each symbol once (as Analysis's chart lists them). */
export function searchableCryptoMarkets(facts: readonly LiveMarketUniverseInstrumentMetadataFact[]): readonly LiveMarketUniverseInstrumentMetadataFact[] {
  const spot = facts.filter(fact => fact.instrument.venue === 'binance-spot');
  const counts = new Map<string, number>();
  for (const fact of spot) counts.set(fact.instrument.symbol, (counts.get(fact.instrument.symbol) ?? 0) + 1);
  return Object.freeze(spot.filter(fact => fact.tradingEnabled && counts.get(fact.instrument.symbol) === 1));
}

export type TypedCryptoSymbol =
  | Readonly<{ kind: 'empty' }>
  /** Exactly a market on the list: its prices are in `quote`. */
  | Readonly<{ kind: 'listed'; symbol: string; quote: string }>
  /** Another spelling of a listed market (BTC/USD, XBTUSD, BTCUSDT.P): Kairos offers it and never changes the text itself. */
  | Readonly<{ kind: 'near'; symbol: string; quote: string }>
  | Readonly<{ kind: 'not-listed'; note: string }>;

/** What a typed crypto symbol is on Binance's list, through matchCryptoMarket's rules (D254). */
export function checkTypedCryptoSymbol(typed: string, markets: readonly LiveMarketUniverseInstrumentMetadataFact[]): TypedCryptoSymbol {
  const shown = typed.trim();
  if (shown === '') return Object.freeze({ kind: 'empty' as const });
  const match = matchCryptoMarket(shown, 'crypto', markets);
  if (!match.ok) return Object.freeze({ kind: 'not-listed' as const, note: `${match.note} You can still save.` });
  const kind = normalizeTradeSymbol(shown) === match.symbol ? 'listed' as const : 'near' as const;
  return Object.freeze({ kind, symbol: match.symbol, quote: match.quote });
}
