import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  listJournalHistoryPage,
  writeJournalFilters,
  type JournalFilters,
  type JournalHistoryCursor,
  type JournalHistoryEntry,
  type JournalHistoryScope,
} from '../../application/journal';
import type { KairosDatabase } from '../../data/database';

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

/**
 * Paging state for the Journal and Practice lists, of the trades matching the filters (U15, D262). Every request takes a
 * sequence number; a slower old answer never replaces a newer one. `timeZone` is the trader's, for the From and To
 * days: while it is still being read (undefined), a list filtered by days waits for it.
 */
export function useJournalHistoryPages(db: KairosDatabase, scope: JournalHistoryScope, filters: JournalFilters, timeZone: string | undefined): JournalHistoryPages {
  // The same filters read again from the address are the same list: only a changed value reads again.
  const filterKey = writeJournalFilters(filters).toString();
  const sameFilters = useMemo(() => filters, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Only the From and To days use the time zone: a list without them never reads again when the zone arrives.
  const byDays = filters.from !== null || filters.to !== null;
  const waitsForZone = byDays && timeZone === undefined;
  const zone = byDays ? timeZone ?? 'UTC' : 'UTC';
  const pageOptions = useCallback((before: JournalHistoryCursor | null) => ({ scope, filters: sameFilters, timeZone: zone, before }), [scope, sameFilters, zone]);
  const [entries, setEntries] = useState<readonly JournalHistoryEntry[]>([]);
  const [cursor, setCursor] = useState<JournalHistoryCursor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [failed, setFailed] = useState(false);
  const [olderFailed, setOlderFailed] = useState(false);
  const sequence = useRef(0);
  const shownCount = useRef(0);

  const load = useCallback(async (atLeast: number): Promise<void> => {
    if (waitsForZone) return;
    const request = ++sequence.current;
    setIsLoading(true);
    setIsLoadingOlder(false);
    setFailed(false);
    setOlderFailed(false);
    try {
      const loaded: JournalHistoryEntry[] = [];
      let next: JournalHistoryCursor | null = null;
      do {
        const page = await listJournalHistoryPage(db, pageOptions(next));
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
  }, [db, pageOptions, waitsForZone]);

  useEffect(() => { void load(0); return () => { sequence.current += 1; }; }, [load]);

  const showOlder = useCallback(() => {
    if (cursor === null) return;
    const request = ++sequence.current;
    setIsLoadingOlder(true);
    setOlderFailed(false);
    void listJournalHistoryPage(db, pageOptions(cursor)).then(page => {
      if (request !== sequence.current) return;
      setEntries(current => { const merged = [...current, ...page.entries]; shownCount.current = merged.length; return merged; });
      setCursor(page.nextCursor);
      setIsLoadingOlder(false);
    }, () => {
      if (request !== sequence.current) return;
      setOlderFailed(true);
      setIsLoadingOlder(false);
    });
  }, [db, pageOptions, cursor]);

  const refresh = useCallback(() => load(shownCount.current), [load]);

  return { entries, isLoading, isLoadingOlder, failed, olderFailed, hasOlder: cursor !== null, showOlder, refresh };
}
