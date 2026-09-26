import { FOREX_MAJOR_CURRENCIES, parseForexPair, projectForexSize } from '../../application/markets/forexPair';
import { GlossaryHint } from '../learn/GlossaryHint';

const majors = `${FOREX_MAJOR_CURRENCIES.slice(0, -1).join(', ')} and ${FOREX_MAJOR_CURRENCIES[FOREX_MAJOR_CURRENCIES.length - 1]}`;
const unitWord = (value: string) => (value === '1' ? 'unit' : 'units');
const lotWord = (value: string) => (value === '1' ? 'lot' : 'lots');

/** P31: the pair in plain words under a forex trade's symbol. Every number comes from forexPair.ts. */
export function ForexTradeNote({ symbol }: { readonly symbol: string }) {
  const parsed = parseForexPair(symbol);
  let body;
  if (symbol.trim() === '') body = <p>Forex: type the currency pair, such as EURUSD or EUR/USD.</p>;
  else if (!parsed.ok) body = parsed.reason === 'same-currency'
    ? <p>A currency pair has two different currencies, such as EURUSD.</p>
    : <p>Type the currency pair as 6 letters, such as EURUSD or EUR/USD.</p>;
  else {
    const { pair } = parsed;
    body = <>
      {pair.quoteKnown
        ? <p>{pair.label}: the price is how many {pair.quote} one {pair.base} costs. Your prices and your result are in {pair.quote}, and Kairos never changes them, so the price currency is saved as {pair.quote}. Only your totals can show them in your home currency.</p>
        : <p>Kairos does not know which currency {pair.symbol}&apos;s price is in, so it saves the currency code you type.</p>}
      {pair.standard
        ? <p>Sizes are in units of {pair.base}, not lots: 1 lot is 100,000 units, a mini lot 10,000 and a micro lot 1,000. <GlossaryHint termId="lot" label="Lot" /></p>
        : <p>Kairos knows pips and lots for the 28 usual pairs of {majors} only, so it shows none for {pair.label}. Sizes are in units of {pair.base}.</p>}
    </>;
  }
  return <div className="kairos-trade-form__forex-note">{body}</div>;
}

/** The Quantity help line for a forex pair: the size in lots, from forexPair.ts. */
export function forexQuantityHint(symbol: string, quantity: string): string | null {
  const parsed = parseForexPair(symbol);
  if (!parsed.ok) return null;
  const { pair } = parsed;
  if (!pair.standard) return `Units of ${pair.base}.`;
  const size = projectForexSize(pair, quantity);
  if (size === null) return `Units of ${pair.base}, not lots: 1 lot is 100,000 units.`;
  if (!size.belowMicroLot) return `${size.units} ${unitWord(size.units)} is ${size.lots} ${lotWord(size.lots)}.`;
  return `${size.units} ${unitWord(size.units)} is ${size.lots} lots, less than a micro lot (1,000 units). Sizes here are units: 0.1 lots is 10,000 units.`;
}
