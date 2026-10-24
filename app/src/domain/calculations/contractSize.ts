/**
 * U11 (P9.A1, D237): the one owner of how much one point of price is worth for one contract. Every money owner (result, closed part,
 * money at risk, × what you risked, the "most risk" rule) reads it here and none decides on its own. It is never filled in for the trader.
 */

import type { DecimalString, MarketType } from '../trades';

/** Crypto perpetuals are logged as futures and priced per coin in one of these (D165, D190), so one point is worth 1. */
export const CONTRACT_SIZE_STABLECOINS: readonly string[] = Object.freeze(['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD', 'DAI']);

export interface ContractSizeInput {
  readonly marketType: MarketType;
  /** The trade's price currency; null or absent when not recorded. */
  readonly grossPnlCurrency?: string | null;
  readonly contractSize?: DecimalString | null;
}

/** `saved`: the trade's own value; `not-needed`: its size is already in units of what is priced; `stablecoin`: a crypto perpetual. */
export type ContractSize =
  | Readonly<{ ok: true; value: DecimalString; basis: 'saved' | 'not-needed' | 'stablecoin' }>
  | Readonly<{ ok: false; reason: 'needs-contract-size' }>;

const ONE = '1' as DecimalString;

export function resolveContractSize(trade: ContractSizeInput): ContractSize {
  if (trade.marketType !== 'futures' && trade.marketType !== 'options') return Object.freeze({ ok: true, value: ONE, basis: 'not-needed' });
  if (trade.contractSize != null) return Object.freeze({ ok: true, value: trade.contractSize, basis: 'saved' });
  if (trade.grossPnlCurrency && CONTRACT_SIZE_STABLECOINS.includes(trade.grossPnlCurrency)) return Object.freeze({ ok: true, value: ONE, basis: 'stablecoin' });
  return Object.freeze({ ok: false, reason: 'needs-contract-size' });
}
