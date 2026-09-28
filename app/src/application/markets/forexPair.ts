/**
 * P31: the one owner of what a forex pair is and of its lot and pip numbers. A pair is six letters after normalizeTradeSymbol: the base currency you buy or sell, then the quote currency its price and result are in — when that quote is itself one of the eight majors (quoteKnown); otherwise the six letters are still a pair, but Kairos never treats the quote as a currency. Kairos knows pips and lots only for the 28 standard pairs of the eight most traded currencies; any other pair is still a pair, with no pip or lot. Every number goes through the decimal kernel; nothing is converted (P33).
 */

import { decimalCompare, decimalDivide, decimalMultiply, decimalSubtract } from '../../domain/calculations';
import { parsePositiveDecimalString, type DecimalString, type TradeSide } from '../../domain/trades';
import { normalizeTradeSymbol } from '../trade-visualizer/tradePictureCandles';

/** The eight most traded currencies, in the market's quoting order: a standard pair puts the earlier one first (EUR/USD, GBP/JPY, USD/CAD). */
export const FOREX_MAJOR_CURRENCIES = Object.freeze(['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'] as const);
/** Units of the base currency in 1 lot, a mini lot and a micro lot. */
export const FOREX_LOT_UNITS = '100000' as DecimalString;
export const FOREX_MINI_LOT_UNITS = '10000' as DecimalString;
export const FOREX_MICRO_LOT_UNITS = '1000' as DecimalString;
/** One pip of a standard pair: 0.0001, or 0.01 when the quote currency is JPY. */
export const FOREX_PIP_SIZE = '0.0001' as DecimalString;
export const FOREX_JPY_PIP_SIZE = '0.01' as DecimalString;

export interface ForexPair {
  /** Six capital letters, as normalizeTradeSymbol writes the symbol: 'EURUSD'. */
  readonly symbol: string;
  /** The currency you buy or sell: the first three letters. */
  readonly base: string;
  /** The currency the price, and so the result, is in: the last three letters. */
  readonly quote: string;
  /** The quote is one of FOREX_MAJOR_CURRENCIES, so the price is surely in that currency. */
  readonly quoteKnown: boolean;
  /** 'EUR/USD'. */
  readonly label: string;
  /** One of the 28 standard pairs of FOREX_MAJOR_CURRENCIES; only then does Kairos know its pip and lot. */
  readonly standard: boolean;
  /** FOREX_JPY_PIP_SIZE when the quote is JPY, else FOREX_PIP_SIZE; null for a pair that is not standard. */
  readonly pipSize: DecimalString | null;
}
export type ForexPairProblem = 'not-a-pair' | 'same-currency';
export type ForexPairResult =
  | Readonly<{ ok: true; pair: ForexPair }>
  | Readonly<{ ok: false; reason: ForexPairProblem }>;
export interface ForexSize {
  /** The size as parsed: a positive decimal. */
  readonly units: DecimalString;
  /** units ÷ FOREX_LOT_UNITS, exact. */
  readonly lots: DecimalString;
  /** Fewer units than a micro lot (1,000). */
  readonly belowMicroLot: boolean;
}

export function parseForexPair(symbol: string): ForexPairResult {
  const code = normalizeTradeSymbol(symbol);
  if (!/^[A-Z]{6}$/.test(code)) return Object.freeze({ ok: false as const, reason: 'not-a-pair' as const });
  const base = code.slice(0, 3);
  const quote = code.slice(3);
  if (base === quote) return Object.freeze({ ok: false as const, reason: 'same-currency' as const });
  const order = FOREX_MAJOR_CURRENCIES as readonly string[];
  const quoteKnown = order.indexOf(quote) >= 0;
  const standard = order.indexOf(base) >= 0 && quoteKnown && order.indexOf(base) < order.indexOf(quote);
  const pipSize = standard ? (quote === 'JPY' ? FOREX_JPY_PIP_SIZE : FOREX_PIP_SIZE) : null;
  const pair: ForexPair = Object.freeze({ symbol: code, base, quote, quoteKnown, label: `${base}/${quote}`, standard, pipSize });
  return Object.freeze({ ok: true as const, pair });
}

export function projectForexSize(pair: ForexPair, units: string): ForexSize | null {
  if (!pair.standard) return null;
  const parsed = parsePositiveDecimalString(units);
  if (!parsed.ok) return null;
  const lots = decimalDivide(parsed.value, FOREX_LOT_UNITS);
  const order = decimalCompare(parsed.value, FOREX_MICRO_LOT_UNITS);
  if (!lots.ok || order === null) return null;
  return Object.freeze({ units: parsed.value, lots: lots.value, belowMicroLot: order < 0 });
}

/** What 1 pip is worth for that size, in pair.quote. */
export function projectForexPipValue(pair: ForexPair, units: DecimalString): DecimalString | null {
  if (pair.pipSize === null) return null;
  const value = decimalMultiply(pair.pipSize, units);
  return value.ok ? value.value : null;
}

/** Pips from one price to another, exact; positive when the price moved the trade's way. */
export function projectForexPips(pair: ForexPair, side: TradeSide, from: DecimalString, to: DecimalString): DecimalString | null {
  if (pair.pipSize === null) return null;
  const move = side === 'long' ? decimalSubtract(to, from) : decimalSubtract(from, to);
  if (!move.ok) return null;
  const pips = decimalDivide(move.value, pair.pipSize);
  return pips.ok ? pips.value : null;
}
