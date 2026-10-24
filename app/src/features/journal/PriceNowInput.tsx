import { useContext, useEffect, useRef, useState } from 'react';
import { describePriceNowFailure, describePriceNowSource, hasPriceNow } from '../../application/market-reference/priceNow';
import type { MarketType } from '../../domain/trades';
import { Button, PriceInput } from '../../design-system/primitives';
import { useTypoCheck } from './MarketMinute';
import { TradeFormMarketContext } from './tradeFormMarket';
import './tradeForm.css';

type State =
  | Readonly<{ kind: 'idle' }>
  /** A retry keeps the failure and its "Try again" on screen (busy), so focus stays where it is. */
  | Readonly<{ kind: 'reading'; fromRetry: boolean; failed: Readonly<{ message: string; retry: boolean }> | null }>
  | Readonly<{ kind: 'filled'; price: string; line: string }>
  | Readonly<{ kind: 'failed'; message: string; retry: boolean }>;

interface Props {
  /** The input's own attributes: id, name, accessible name, invalid, description. */
  readonly input: Readonly<{ id: string; name?: string; 'aria-label'?: string; 'aria-invalid'?: boolean | 'true'; 'aria-describedby'?: string; 'aria-required'?: boolean | 'true' }>;
  readonly value: string;
  readonly onValueChange: (text: string) => void;
  readonly marketType: MarketType | '';
  readonly symbol: string;
  /** What the button fills, for its name: "the entry price", "entry 1". */
  readonly fills: string;
  /** The `datetime-local` time this price was at, for "Typo?" (D257); empty when there is none yet. */
  readonly pairedTime?: string;
}

/**
 * U14 (D256): a price field with "Price now" beside it. A tap fills the field with the latest price and says where it
 * came from; it never fills by itself. Typing clears the source line. Without a market provider, or for a market with
 * no source (stocks), it is the plain price field.
 */
export function PriceNowInput({ input, value, onValueChange, marketType, symbol, fills, pairedTime = '' }: Props) {
  const market = useContext(TradeFormMarketContext);
  const read = market?.priceNow;
  const offered = read !== undefined && hasPriceNow(marketType, symbol);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const controller = useRef<AbortController | null>(null);
  // A new market or symbol starts over: the old price and its reason belong to the old one.
  useEffect(() => { controller.current?.abort(); setState({ kind: 'idle' }); }, [marketType, symbol]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (state.kind === 'failed' && state.retry) retryRef.current?.focus();
  }, [state]);

  async function ask(fromRetry: boolean): Promise<void> {
    if (read === undefined || state.kind === 'reading' || marketType === '') return;
    controller.current?.abort();
    const mine = new AbortController();
    controller.current = mine;
    setState({ kind: 'reading', fromRetry, failed: fromRetry && state.kind === 'failed' ? state : null });
    const result = await read({ marketType, symbol: symbol.trim() }, mine.signal);
    if (mine.signal.aborted) return;
    if (result.ok) {
      onValueChange(result.price);
      setState({ kind: 'filled', price: result.price, line: describePriceNowSource(result) });
      // "Try again" goes away with the failure: focus moves to the button that worked.
      if (fromRetry) buttonRef.current?.focus();
      return;
    }
    const words = describePriceNowFailure(result);
    setState({ kind: 'failed', message: words.message, retry: words.retry });
    // A retry whose answer has no "Try again" moves focus to the button, never to the page.
    if (fromRetry && !words.retry) buttonRef.current?.focus();
  }

  const typo = useTypoCheck({ marketType, symbol, price: value, localTime: pairedTime });
  const typoId = `${input.id}-typo`;
  const statusId = `${input.id}-price-now`;
  const line = state.kind === 'filled' && state.price === value ? state.line : null;
  const failed = state.kind === 'failed' ? state : state.kind === 'reading' ? state.failed : null;
  const reading = state.kind === 'reading';
  const shows = line !== null || failed !== null;
  const describedBy = [input['aria-describedby'], shows ? statusId : null, typo !== null ? typoId : null].filter(Boolean).join(' ') || undefined;
  return <div className="kairos-price-now">
    <div className="kairos-price-now__row">
      <PriceInput {...input} aria-describedby={describedBy} value={value} onValueChange={onValueChange} />
      {offered ? <Button ref={buttonRef} variant="secondary" size="sm" aria-label={`Price now for ${fills}`} aria-disabled={reading || undefined} aria-busy={reading || undefined}
        onClick={() => { void ask(false); }}>Price now</Button> : null}
    </div>
    {offered && line !== null ? <small id={statusId} className="kairos-price-now__source">{line}</small> : null}
    {offered && failed !== null ? <small id={statusId} className="kairos-price-now__failed">{failed.message}
      {failed.retry ? <> <Button ref={retryRef} variant="ghost" size="sm" aria-disabled={reading || undefined} aria-busy={reading || undefined} onClick={() => { void ask(true); }}>Try again</Button></> : null}</small> : null}
    <div aria-live="polite">{typo !== null ? <small id={typoId} className="kairos-price-now__typo">{typo}</small> : null}</div>
  </div>;
}
