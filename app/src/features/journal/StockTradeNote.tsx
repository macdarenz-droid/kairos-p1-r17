import { parseStockTicker, type StockTickerProblem } from '../../application/markets/stockTicker';
import { isPriceCurrencyInput } from '../../application/trades/priceCurrencyInput';
import { GlossaryHint } from '../learn/GlossaryHint';

/** P32: plain words for a symbol that is not a ticker. The note and the form's error share them. */
export const STOCK_TICKER_MESSAGES: Readonly<Record<StockTickerProblem, string>> = Object.freeze({
  'ticker-required': 'Stocks: type the ticker, such as AAPL, BRK.B, 7203.T or VOD.L.',
  'not-a-ticker': 'Type only the ticker: letters and digits, joined by a dot, a hyphen or &, such as AAPL, BRK.B, 7203.T or VOD.L. Leave out the exchange or country: NASDAQ:AAPL and AAPL US are both AAPL. For a share class, use a dot: BRK/B and BRK B are both BRK.B.',
});

/** Quick log's Quantity hint for a stock. */
export const STOCK_QUANTITY_HINT = 'Number of shares, such as 10. Parts of a share, such as 0.5, are fine.';

/** P32: what a stock trade's symbol, prices, size and currency mean, under the form's trade details. */
export function StockTradeNote({ symbol, priceCurrency }: { readonly symbol: string; readonly priceCurrency: string }) {
  const ticker = parseStockTicker(symbol);
  const typed = priceCurrency.trim();
  const currency = typed.toUpperCase();
  return <div className="kairos-trade-form__stock-note">
    {ticker.ok
      ? <p>{`${ticker.ticker}: every price is the price of one share, and Quantity is the number of shares. Parts of a share, such as 0.5, are fine.`} <GlossaryHint termId="share" label="Share" /></p>
      : <p>{STOCK_TICKER_MESSAGES[ticker.reason]} <GlossaryHint termId="ticker" label="Ticker" /></p>}
    {typed === 'GBp'
      ? <p>GBp means pence. Kairos saves currency codes in capital letters, so GBp would be saved as GBP, which means pounds (100 times more). Type GBX for prices in pence.</p>
      : currency !== '' && isPriceCurrencyInput(currency)
      ? <p>{`Your prices and your result are in ${currency}. Kairos never changes them; only your totals can show them in your home currency.`}</p>
      : <p>Kairos never guesses a stock&apos;s currency from its ticker: type its code in Currency code below, such as USD, EUR or JPY. For prices in pence, type GBX, not GBP (GBP means pounds), even when your broker shows GBp. Without it, fees cannot be taken off your result.</p>}
  </div>;
}
