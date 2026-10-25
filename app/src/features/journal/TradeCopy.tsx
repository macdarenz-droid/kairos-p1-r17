import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { JournalHistoryEntry } from '../../application/journal';
import type { ManualTradeDraft } from '../../application/trades/manualTradeDraft';
import { duplicateTradeDraft } from '../../application/trades/savedTradeDraft';
import { clearTradeFormDraft, isTradeFormDraftEmpty, readTradeFormDraft, type TradeFormDraftScope } from '../../application/trades/tradeFormDraft';
import type { KairosDatabase } from '../../data/database';
import { tradeJournalAt } from '../../domain/trades';
import { Button } from '../../design-system/primitives';

/** Duplicate's copy (D264): what fills the form, and the line above it ("Copied from your BTCUSDT trade of 24 Oct."). */
export type TradeCopy = Readonly<{ draft: ManualTradeDraft; note: string }>;

const TRADE_COPY_STATE = 'kairos.trade-copy';

function journalDay(trade: JournalHistoryEntry['trade']): string {
  const date = new Date(tradeJournalAt(trade));
  return Number.isNaN(date.getTime()) ? tradeJournalAt(trade) : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date);
}

/** Navigation state the trade page's Duplicate sends to the log page (Practice: its page). */
export function tradeCopyState(entry: Pick<JournalHistoryEntry, 'trade' | 'plans'>): Readonly<Record<string, TradeCopy>> {
  return { [TRADE_COPY_STATE]: { draft: duplicateTradeDraft(entry), note: `Copied from your ${entry.trade.symbol} trade of ${journalDay(entry.trade)}.` } };
}

/** The copy in the address's state, or null. Only Duplicate writes it; anything else there is not a copy. */
function sentCopy(state: unknown): TradeCopy | null {
  const value = (state as Readonly<Record<string, unknown>> | null)?.[TRADE_COPY_STATE] as Partial<TradeCopy> | undefined;
  return value !== undefined && typeof value === 'object' && value !== null && typeof value.note === 'string'
    && typeof value.draft === 'object' && value.draft !== null && typeof value.draft.symbol === 'string' && typeof value.draft.plan === 'object' ? value as TradeCopy : null;
}

type Arrival =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'reading'; copy: TradeCopy }>
  | Readonly<{ kind: 'asking'; copy: TradeCopy }>
  | Readonly<{ kind: 'copy'; copy: TradeCopy }>
  | Readonly<{ kind: 'kept' }>;

/**
 * U15 (D264): where Duplicate's copy arrives, around the trade form. With no copy it shows the form as usual. With one,
 * it first looks for a trade being typed on this device (D258): when there is one, it asks "Use the copy" or "Keep what
 * you were typing" before anything is replaced. The copy fills the form with "Copied from your … trade of …" above it.
 * The question, then the copy's line (or, kept, the form's first field) takes focus; `onFocused` hears it, so a page
 * whose form is further down can keep it in view. The address forgets the copy once it arrives.
 */
export function TradeCopyArrival({ db, scope, firstFieldId, onFocused, children }: {
  readonly db: KairosDatabase;
  readonly scope: TradeFormDraftScope;
  /** The form's first field, which takes focus when the trader keeps what they were typing. */
  readonly firstFieldId: string;
  readonly onFocused?: () => void;
  /** The form, opened with the copy's draft or with none. */
  readonly children: (draft: ManualTradeDraft | undefined) => ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [arrival, setArrival] = useState<Arrival>(() => {
    const copy = sentCopy(location.state);
    return copy === null ? { kind: 'none' } : { kind: 'reading', copy };
  });
  const question = useRef<HTMLParagraphElement>(null);
  const line = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (arrival.kind !== 'reading') return;
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
    let active = true;
    void readTradeFormDraft(db, scope).then(kept => {
      if (active) setArrival(kept !== null && !isTradeFormDraftEmpty(kept.draft) ? { kind: 'asking', copy: arrival.copy } : { kind: 'copy', copy: arrival.copy });
    });
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const target = arrival.kind === 'asking' ? question.current : arrival.kind === 'copy' ? line.current : arrival.kind === 'kept' ? document.getElementById(firstFieldId) : null;
    if (target === null) return;
    target.focus();
    onFocused?.();
  }, [arrival.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  async function takeTheCopy(copy: TradeCopy): Promise<void> {
    // The copy replaces what was being typed, which is then forgotten.
    await clearTradeFormDraft(db, scope);
    setArrival({ kind: 'copy', copy });
  }

  if (arrival.kind === 'reading') return <p role="status" className="kairos-trade-copy">Opening the copy…</p>;
  if (arrival.kind === 'asking') return <div className="kairos-trade-copy" role="group" aria-labelledby="kairos-trade-copy-question">
    <p id="kairos-trade-copy-question" ref={question} tabIndex={-1}>You were typing another trade. Use the copy of your {arrival.copy.draft.symbol} trade instead, or keep what you were typing?</p>
    <div className="kairos-trade-copy__choices">
      <Button variant="primary" onClick={() => { void takeTheCopy(arrival.copy); }}>Use the copy</Button>
      <Button variant="secondary" onClick={() => setArrival({ kind: 'kept' })}>Keep what you were typing</Button>
    </div>
  </div>;
  if (arrival.kind === 'copy') return <>
    <p ref={line} tabIndex={-1} className="kairos-trade-copy kairos-trade-copy__line">{arrival.copy.note}</p>
    {children(arrival.copy.draft)}
  </>;
  return <>{children(undefined)}</>;
}
