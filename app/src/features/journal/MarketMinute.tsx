import { useContext, useEffect, useRef, useState } from 'react';
import {
  checkPriceAtMinute, describeMarketMinute, describeMarketMinuteFailure, describeTypo, localTimeToInstant,
} from '../../application/market-reference/minuteCheck';
import { hasPriceNow } from '../../application/market-reference/priceNow';
import type { MarketType } from '../../domain/trades';
import { Button } from '../../design-system/primitives';
import { TradeFormMarketContext } from './tradeFormMarket';
import './tradeForm.css';

/** How long typing must pause before "Typo?" reads the market. */
export const TYPO_CHECK_PAUSE_MS = 600;

/**
 * U14 (D257): "BTCUSDT did not trade at 6500 at 10:32 … Typo?" for a crypto or futures price whose time is set, or null.
 * It reads the minute after a pause, a newer edit cancels the older read, and it never blocks or changes the price.
 */
export function useTypoCheck(ask: Readonly<{ marketType: MarketType | ''; symbol: string; price: string; localTime: string }>): string | null {
  const read = useContext(TradeFormMarketContext)?.minute;
  const { marketType, symbol, price, localTime } = ask;
  const at = localTimeToInstant(localTime);
  // Binance's candles are trades; OANDA's mid prices can't judge a fill (forex has no "Typo?").
  const checks = read !== undefined && (marketType === 'crypto' || marketType === 'futures') && hasPriceNow(marketType, symbol) && at !== null && price.trim() !== '';
  const [warning, setWarning] = useState<Readonly<{ key: string; text: string | null }>>({ key: '', text: null });
  const key = [marketType, symbol.trim(), price.trim(), at].join('|');
  useEffect(() => {
    if (!checks || read === undefined || at === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void read({ marketType, symbol: symbol.trim(), at }, controller.signal).then(minute => {
        if (controller.signal.aborted) return;
        // Only a final range can judge a price: never a running minute (read before it ended), and never a futures
        // price against Binance Spot's minute (read when there are no futures candles).
        const judged = minute.ok && minute.complete && (marketType !== 'futures' || minute.futures);
        const outside = minute.ok && checkPriceAtMinute(minute, price) !== 'inside' && checkPriceAtMinute(minute, price) !== null;
        setWarning({ key, text: minute.ok && judged && outside ? describeTypo(minute, price) : null });
      });
    }, TYPO_CHECK_PAUSE_MS);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [checks, read, key]);
  return checks && warning.key === key ? warning.text : null;
}

type MinuteState =
  | Readonly<{ kind: 'idle' }>
  /** A retry keeps the failure and its "Try again" on screen (busy), so focus stays where it is. */
  | Readonly<{ kind: 'reading'; fromRetry: boolean; failed: Extract<MinuteState, { kind: 'failed' }> | null }>
  | Readonly<{ kind: 'shown'; key: string; text: string }>
  | Readonly<{ kind: 'failed'; key: string; message: string; retry: boolean }>;

/**
 * U14 (D257, D12): "See the market price at that minute" under a time: the 1-minute candle that holds it, in plain
 * words, or why there is none, with "Try again" where it helps. Nothing appears for a market with no price source.
 */
export function MarketMinuteLink({ marketType, symbol, localTime, id, of }: {
  readonly marketType: MarketType | ''; readonly symbol: string; readonly localTime: string; readonly id: string;
  /** Which time, for the link's name: "opened", "closed", "entry 1". */
  readonly of: string;
}) {
  const read = useContext(TradeFormMarketContext)?.minute;
  const at = localTimeToInstant(localTime);
  const offered = read !== undefined && hasPriceNow(marketType, symbol) && at !== null;
  const key = [marketType, symbol.trim(), at].join('|');
  const [state, setState] = useState<MinuteState>({ kind: 'idle' });
  const linkRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (state.kind === 'failed' && state.retry) retryRef.current?.focus(); }, [state]);
  if (!offered || read === undefined || at === null || marketType === '') return null;

  async function ask(fromRetry: boolean): Promise<void> {
    if (read === undefined || at === null || marketType === '' || state.kind === 'reading') return;
    controller.current?.abort();
    const mine = new AbortController();
    controller.current = mine;
    setState({ kind: 'reading', fromRetry, failed: fromRetry && state.kind === 'failed' ? state : null });
    const minute = await read({ marketType, symbol: symbol.trim(), at }, mine.signal);
    if (mine.signal.aborted) return;
    if (minute.ok) {
      setState({ kind: 'shown', key, text: describeMarketMinute(minute) });
      // "Try again" goes away with the failure: focus moves back to the link.
      if (fromRetry) linkRef.current?.focus();
      return;
    }
    const words = describeMarketMinuteFailure(minute);
    setState({ kind: 'failed', key, message: words.message, retry: words.retry });
    // A retry whose answer has no "Try again" moves focus to the link, never to the page.
    if (fromRetry && !words.retry) linkRef.current?.focus();
  }

  // An answer for another time or market is never shown.
  const reading = state.kind === 'reading';
  const shownState = state.kind === 'reading' ? state.failed : state;
  const current = shownState !== null && (shownState.kind === 'shown' || shownState.kind === 'failed') && shownState.key === key ? shownState : null;
  return <div className="kairos-market-minute">
    <Button ref={linkRef} variant="ghost" size="sm" aria-label={`See the market price at that minute, ${of}`} aria-describedby={current ? `${id}-minute` : undefined} aria-disabled={reading || undefined} aria-busy={reading || undefined}
      onClick={() => { void ask(false); }}>See the market price at that minute</Button>
    <div aria-live="polite">
      {current?.kind === 'shown' ? <small id={`${id}-minute`} className="kairos-market-minute__line">{current.text}</small> : null}
      {current?.kind === 'failed' ? <small id={`${id}-minute`} className="kairos-market-minute__line">{current.message}
        {current.retry ? <> <Button ref={retryRef} variant="ghost" size="sm" aria-disabled={reading || undefined} aria-busy={reading || undefined} onClick={() => { void ask(true); }}>Try again</Button></> : null}</small> : null}
    </div>
  </div>;
}
