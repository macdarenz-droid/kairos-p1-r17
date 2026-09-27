import type { MarketType } from '../../domain/trades';
import type { MarketCandleOrigin } from '../../services/market-data/MarketCandleHistoryPort';
import type { LiveMarketUniverseInstrumentMetadataFact } from '../../services/market-data/liveMarketUniverseInstrumentMetadataFact';

export type CryptoCandleMarket = 'spot' | 'usdm-futures';
export type CryptoMarketMatchHow = 'exact' | 'separators' | 'perpetual-mark' | 'xbt-is-btc' | 'usd-as-usdt';

export interface CryptoMarketMatch {
  readonly ok: true;
  readonly symbol: string;
  readonly base: string;
  readonly quote: string;
  readonly candles: CryptoCandleMarket;
  /** Every rule used, in order; ['exact'] when the text was the symbol. */
  readonly how: readonly CryptoMarketMatchHow[];
  /** One plain sentence when the match was not exact; null otherwise. */
  readonly note: string | null;
}

export type CryptoMarketMatchResult =
  | CryptoMarketMatch
  | Readonly<{ ok: false; why: 'empty' | 'not-listed'; note: string }>;

const LISTED_VENUE = 'binance-spot';
/** Longest first, so ".PERP" wins over ".P". */
const PERPETUAL_MARKS = ['.PERP', '-PERP', '_PERP', '.P'] as const;
const SEPARATOR = /[/\-_:]/;

type Listed = ReadonlyMap<string, LiveMarketUniverseInstrumentMetadataFact>;
type Resolved = Readonly<{ fact: LiveMarketUniverseInstrumentMetadataFact; how: readonly CryptoMarketMatchHow[] }>;

/**
 * Matches what a trader typed to one Binance Spot market on the list, and says which rules it used.
 * The list decides: a rule applies only when it leads to a listed market.
 */
export function matchCryptoMarket(
  typed: string,
  marketType: MarketType,
  markets: readonly LiveMarketUniverseInstrumentMetadataFact[],
): CryptoMarketMatchResult {
  const shown = typed.trim();
  const text = shown.toUpperCase().replace(/\s+/g, '');
  if (!text) return Object.freeze({ ok: false, why: 'empty', note: 'Type a market, for example BTCUSDT.' });

  const listed: Map<string, LiveMarketUniverseInstrumentMetadataFact> = new Map();
  for (const fact of markets) {
    if (fact.instrument.venue === LISTED_VENUE && !listed.has(fact.instrument.symbol)) listed.set(fact.instrument.symbol, fact);
  }

  const resolved = resolve(text, listed);
  if (resolved === null) {
    return Object.freeze({ ok: false, why: 'not-listed', note: `Binance doesn't list ${shown}. Check the spelling, for example BTCUSDT.` });
  }
  const { fact, how } = resolved;
  const base = fact.baseAsset;
  const quote = fact.quoteAsset;
  const perpetual = how.includes('perpetual-mark');
  let note: string | null = null;
  if (how[0] !== 'exact') {
    note = `Matched ${shown} to ${base}/${quote} on Binance.`;
    if (how.includes('usd-as-usdt')) note += ` Binance has no ${base}/USD market, so Kairos shows ${base}/USDT (USDT is a dollar stablecoin).`;
    if (perpetual) note += ' Futures candles.';
  }
  return Object.freeze({
    ok: true,
    symbol: fact.instrument.symbol,
    base,
    quote,
    candles: marketType === 'futures' || perpetual ? 'usdm-futures' : 'spot',
    how: Object.freeze([...how]),
    note,
  });
}

function resolve(text: string, listed: Listed): Resolved | null {
  const exact = listed.get(text);
  if (exact) return { fact: exact, how: ['exact'] };

  const mark = PERPETUAL_MARKS.find((candidate) => text.length > candidate.length && text.endsWith(candidate));
  if (mark) {
    const found = resolveWithoutMark(text.slice(0, -mark.length), listed);
    return found === null ? null : { fact: found.fact, how: ['perpetual-mark', ...found.how] };
  }
  const plain = resolveWithoutMark(text, listed);
  if (plain !== null) return plain;
  // A bare PERP counts as a mark only when what remains finds its market (PERPUSDT is a coin named PERP).
  if (text.length > 4 && text.endsWith('PERP')) {
    const found = resolveWithoutMark(text.slice(0, -4), listed);
    if (found !== null) return { fact: found.fact, how: ['perpetual-mark', ...found.how] };
  }
  return null;
}

/** Rules (a), (c), (d) and (e) on text that carries no perpetual mark. */
function resolveWithoutMark(text: string, listed: Listed): Resolved | null {
  const exact = listed.get(text);
  if (exact) return { fact: exact, how: [] };

  const how: CryptoMarketMatchHow[] = [];
  const parts = text.split(SEPARATOR);
  let base: string;
  let quote: string;
  if (parts.length === 2 && parts[0] && parts[1]) {
    how.push('separators');
    [base, quote] = parts;
    const joined = listed.get(base + quote);
    if (joined) return { fact: joined, how };
  } else if (parts.length === 1) {
    // Without a separator, the text is tried as XBT… and as …USD.
    base = text;
    quote = '';
  } else {
    return null;
  }
  if (base.startsWith('XBT')) {
    base = `BTC${base.slice(3)}`;
    how.push('xbt-is-btc');
    const renamed = listed.get(base + quote);
    if (renamed) return { fact: renamed, how };
  }
  const symbol = base + quote;
  if (symbol.endsWith('USD') && (quote === '' || quote === 'USD') && !listed.has(symbol)) {
    const usdt = listed.get(`${symbol}T`);
    if (usdt) return { fact: usdt, how: [...how, 'usd-as-usdt'] };
  }
  return null;
}

/** The source line under a picture: where the candles came from, and why when it is not the usual place. */
export function describeCandleSource(origin: MarketCandleOrigin | undefined, match: CryptoMarketMatch, asked: CryptoCandleMarket): string {
  const spot = origin === undefined || origin.market === 'spot';
  const provider = origin?.provider === 'okx' ? 'OKX' : 'Binance';
  let line = `Candles: ${provider} ${spot ? 'Spot' : 'Futures'} · ${match.base}/${match.quote}`;
  if (origin?.backup === 'refused') line += " · Binance isn't available in your region";
  else if (origin?.backup === 'busy') line += ' · Binance was busy';
  else if (origin?.backup === 'down') line += " · Binance didn't answer";
  if (asked === 'usdm-futures' && spot) {
    line += origin === undefined ? ' · futures candles need the Kairos server' : ' · no futures candles for this market';
  }
  return line;
}
