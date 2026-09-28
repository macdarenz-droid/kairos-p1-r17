import { decimalDivide, decimalSubtract } from '../domain/calculations/decimalKernel';
import { parseDecimalString, type DecimalString } from '../domain/trades';
import type { HomeYourTrade } from '../application/dashboard/homeDashboardYourTradesQuery';

// Dimensionless presentation weights, consumed by the existing bounded packer.
// These never become financial results or change the saved outcome/currency.
export type YourTradeSizeBasis = 'profit' | 'loss' | 'breakeven' | 'unavailable' | 'currency-missing';

function resultAmount(trade: HomeYourTrade): DecimalString | null {
  if (trade.status !== 'closed' || trade.source === 'none' || trade.amount === null || trade.outcome === 'unavailable') return null;
  const parsed = parseDecimalString(trade.amount);
  if (!parsed.ok) return null;
  const amount = parsed.value;
  const zero = /^-?0(?:\.0+)?$/.test(amount);
  if (trade.outcome === 'profit' && !zero && !amount.startsWith('-')) return amount;
  if (trade.outcome === 'loss' && !zero && amount.startsWith('-')) return amount;
  if (trade.outcome === 'breakeven' && zero) return amount;
  return null;
}

/** Relative profit size within each exact recorded currency across the loaded
 * history, before pagination. Losses deliberately stay small, even large losses.
 * No FX, currency inference, financial arithmetic or cross-currency ranking.
 */
export function projectYourTradeBubbleSizes(trades: readonly HomeYourTrade[]) {
  const values = trades.map(trade => ({ trade, amount: resultAmount(trade) }));
  const maxima = new Map<string, DecimalString>();
  for (const { trade, amount } of values) {
    if (!amount || trade.outcome !== 'profit' || !trade.currency?.trim()) continue;
    const maximum = maxima.get(trade.currency);
    const difference = maximum ? decimalSubtract(amount, maximum) : null;
    if (!maximum || (difference?.ok && difference.value !== '0' && !difference.value.startsWith('-'))) maxima.set(trade.currency, amount);
  }
  return values.map(({ trade, amount }): { readonly key: string; readonly radius: number; readonly basis: YourTradeSizeBasis } => {
    if (!amount) return { key: trade.id, radius: .4, basis: 'unavailable' };
    if (trade.outcome === 'loss') return { key: trade.id, radius: .3, basis: 'loss' };
    if (trade.outcome === 'breakeven') return { key: trade.id, radius: .4, basis: 'breakeven' };
    const maximum = trade.currency ? maxima.get(trade.currency) : undefined;
    if (!maximum) return { key: trade.id, radius: .5, basis: 'currency-missing' };
    // Convert only the bounded ratio to pixels/geometry; never the money itself.
    const normalized = decimalDivide(amount, maximum);
    if (!normalized.ok) return { key: trade.id, radius: .4, basis: 'unavailable' };
    const ratio = Number(normalized.value);
    return { key: trade.id, radius: .5 + .5 * Math.sqrt(Math.max(0, Math.min(1, ratio))), basis: 'profit' };
  });
}
