import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearTradeFormDraft, isTradeFormDraftEmpty, keepTradeFormDraft, readTradeFormDraft,
  type KeptTradeFormDraft, type TradeFormDraft, type TradeFormDraftMode, type TradeFormDraftScope,
} from '../../application/trades/tradeFormDraft';
import type { KairosDatabase } from '../../data/database';

/** The trade being typed is written at most once a second while it changes (D258). */
export const KEEP_TRADE_DRAFT_EVERY_MS = 1_000;

/**
 * U14 (D258): keeps the trade form's typing on this device. It reads the kept trade once when the form opens and hands
 * it to `onFound` only while nothing is typed yet; from then on it writes what is typed at most once a second, and at
 * once when the form goes away or the page is hidden. `clear` forgets it (a save, "Start over").
 */
export function useKeptTradeFormDraft(
  db: KairosDatabase, scope: TradeFormDraftScope, current: Readonly<{ mode: TradeFormDraftMode; draft: TradeFormDraft }>,
  options: Readonly<{ read: boolean; onFound: (kept: KeptTradeFormDraft) => void }>,
): Readonly<{ clear: () => Promise<void> }> {
  const latest = useRef(current);
  latest.current = current;
  const onFound = useRef(options.onFound);
  onFound.current = options.onFound;
  // Until the kept trade is read, only typing is written (when the form goes away): an empty form would remove it first.
  const [ready, setReady] = useState(!options.read);
  const readyNow = useRef(ready);
  readyNow.current = ready;
  useEffect(() => {
    if (!options.read) return;
    let active = true;
    void readTradeFormDraft(db, scope).then(kept => {
      if (!active) return;
      if (kept !== null && isTradeFormDraftEmpty(latest.current.draft)) onFound.current(kept);
      setReady(true);
    });
    return () => { active = false; };
    // Read once per form: a later change of `read` (Practice's plan) does not read again.
  }, [db, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const timer = useRef<number | null>(null);
  const pending = useRef(false);
  const flush = useCallback(() => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
    if (!pending.current) return;
    if (!readyNow.current && isTradeFormDraftEmpty(latest.current.draft)) return;
    pending.current = false;
    void keepTradeFormDraft(db, scope, latest.current);
  }, [db, scope]);
  useEffect(() => {
    pending.current = true;
    if (ready && timer.current === null) timer.current = window.setTimeout(flush, KEEP_TRADE_DRAFT_EVERY_MS);
  }, [ready, current.mode, current.draft, flush]);
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden); flush(); };
  }, [flush]);

  const clear = useCallback(async () => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
    pending.current = false;
    await clearTradeFormDraft(db, scope);
  }, [db, scope]);
  return { clear };
}
