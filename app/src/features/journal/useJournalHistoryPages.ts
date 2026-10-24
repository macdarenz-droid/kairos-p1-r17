import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listJournalHistoryPage,
  type JournalHistoryCursor,
  type JournalHistoryEntry,
  type JournalHistoryScope,
} from '../../application/journal';
import type { KairosDatabase } from '../../data/database';
import type { TradeStatus } from '../../domain/trades';

export interface JournalHistoryPages {
  readonly entries: readonly JournalHistoryEntry[];
  readonly isLoading: boolean;
  readonly isLoadingOlder: boolean;
  readonly failed: boolean;
  readonly olderFailed: boolean;
  readonly hasOlder: boolean;
  readonly showOlder: () => void;
  /** Reloads from the newest trade until at least as many trades as were shown are back, or none are left. */
  readonly refresh: () => Promise<void>;
}

function pageOptions(scope: JournalHistoryScope, status: TradeStatus | '', before: JournalHistoryCursor | null) {
  return status === '' ? { scope, before } : { scope, status, before };
}

/**
 * Paging state for the Journal and Practice lists. Every request takes a
 * sequence number; a slower old answer never replaces a newer one.
 */
export function useJournalHistoryPages(db: KairosDatabase, scope: JournalHistoryScope, status: TradeStatus | ''): JournalHistoryPages {
  const [entries, setEntries] = useState<readonly JournalHistoryEntry[]>([]);
  const [cursor, setCursor] = useState<JournalHistoryCursor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [failed, setFailed] = useState(false);
  const [olderFailed, setOlderFailed] = useState(false);
  const sequence = useRef(0);
  const shownCount = useRef(0);

  const load = useCallback(async (atLeast: number): Promise<void> => {
    const request = ++sequence.current;
    setIsLoading(true);
    setIsLoadingOlder(false);
    setFailed(false);
    setOlderFailed(false);
    try {
      const loaded: JournalHistoryEntry[] = [];
      let next: JournalHistoryCursor | null = null;
      do {
        const page = await listJournalHistoryPage(db, pageOptions(scope, status, next));
        if (request !== sequence.current) return;
        loaded.push(...page.entries);
        next = page.nextCursor;
      } while (next !== null && loaded.length < atLeast);
      shownCount.current = loaded.length;
      setEntries(loaded);
      setCursor(next);
    } catch {
      if (request === sequence.current) setFailed(true);
    } finally {
      if (request === sequence.current) setIsLoading(false);
    }
  }, [db, scope, status]);

  useEffect(() => { void load(0); return () => { sequence.current += 1; }; }, [load]);

  const showOlder = useCallback(() => {
    if (cursor === null) return;
    const request = ++sequence.current;
    setIsLoadingOlder(true);
    setOlderFailed(false);
    void listJournalHistoryPage(db, pageOptions(scope, status, cursor)).then(page => {
      if (request !== sequence.current) return;
      setEntries(current => { const merged = [...current, ...page.entries]; shownCount.current = merged.length; return merged; });
      setCursor(page.nextCursor);
      setIsLoadingOlder(false);
    }, () => {
      if (request !== sequence.current) return;
      setOlderFailed(true);
      setIsLoadingOlder(false);
    });
  }, [db, scope, status, cursor]);

  const refresh = useCallback(() => load(shownCount.current), [load]);

  return { entries, isLoading, isLoadingOlder, failed, olderFailed, hasOlder: cursor !== null, showOlder, refresh };
}
