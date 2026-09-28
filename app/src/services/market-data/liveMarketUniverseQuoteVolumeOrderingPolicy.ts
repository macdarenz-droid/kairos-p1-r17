import { decimalSubtract } from '../../domain/calculations';
import type { LiveMarketSummaryFact } from './marketDataTypes';
function compareInstrumentSymbols(left: string, right: string): number { if (left < right) return -1; if (left > right) return 1; return 0; }
export function orderLiveMarketUniverseByQuoteVolume(facts: readonly LiveMarketSummaryFact[]): readonly LiveMarketSummaryFact[] {
  return [...facts].sort((left, right) => {
    const difference = decimalSubtract(left.quoteVolume24h, right.quoteVolume24h);
    if (!difference.ok) throw new Error('live-market-universe-quote-volume-invalid');
    if (difference.value === '0') return compareInstrumentSymbols(left.instrument.symbol, right.instrument.symbol);
    return difference.value.startsWith('-') ? 1 : -1;
  });
}
