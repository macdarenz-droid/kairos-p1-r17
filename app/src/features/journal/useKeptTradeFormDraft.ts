import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearTradeFormDraft, isTradeFormDraftEmpty, keepTradeFormDraft, readTradeFormDraft,
  type KeptTradeFormDraft, type TradeFormDraft, type TradeFormDraftMode, type TradeFormDraftScope,
} from '../../application/trades/tradeFormDraft';
import type { KairosDatabase } from '../../data/database';

/** The trade being typed is written at most once a second while it changes (D258). */
export const KEEP_TRADE_DRAFT_EVERY_MS = 1_000;

type Kept = Readonly<{ mode: TradeFormDraftMode; draft: TradeFormDraft }>;
/** What a write would leave on the device: nothing for an empty form, else the typed trade. */
const persisted = (kept: Kept): string => (isTradeFormDraftEmpty(kept.draft) ? '' : JSON.stringify(kept));

/**
 * U14 (D258): keeps the trade form's typing on this device. It reads the kept trade once when the form opens and hands
 * it to `onFound` only while nothing is typed yet; from then on it writes what is typed at most once a second, and at
 * once when the form goes away or the page is hidden. It writes only what differs from what it read or last wrote, so
 * opening a form, or a plan handed to it, writes nothing. `clear` forgets it (a save, "Start over"). With `keep` false
 * (U15, D263: editing a saved trade) it neither reads nor writes.
 */
export function useKeptTradeFormDraft(
  db: KairosDatabase, scope: TradeFormDraftScope, current: Readonly<{ mode: TradeFormDraftMode; draft: TradeFormDraft }>,
  options: Readonly<{ read: boolean; onFound: (kept: KeptTradeFormDraft) => void; keep?: boolean }>,
): Readonly<{ clear: () => Promise<void> }> {
  const latest = useRef(current);
  latest.current = current;
  // What the device holds now, as far as this form knows: what it read, else what it opened with, else what it wrote.
  const written = useRef<string | null>(options.read ? null : persisted(current));
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
      // As the form will hold it (no save time), so a restored trade left alone is never written again.
      written.current = kept === null ? '' : persisted({ mode: kept.mode, draft: kept.draft });
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
    if (!pending.current || options.keep === false) return;
    if (!readyNow.current && isTradeFormDraftEmpty(latest.current.draft)) return;
    pending.current = false;
    const next = persisted(latest.current);
    if (next === written.current) return;
    written.current = next;
    void keepTradeFormDraft(db, scope, latest.current);
  }, [db, scope, options.keep]);
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
    written.current = '';
    await clearTradeFormDraft(db, scope);
  }, [db, scope]);
  return { clear };
}
