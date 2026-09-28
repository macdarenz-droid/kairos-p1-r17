import { useEffect, useRef, useState } from 'react';
import { loadNewsNearTrades, type NewsNearTrade } from '../../application/economic-calendar/newsNearTrades';
import type { KairosDatabase } from '../../data/database';
import type { TradeRecord } from '../../domain/trades';

type NewsNearTradesInput = Pick<TradeRecord, 'id' | 'status' | 'openedAt' | 'closedAt'>;
const NONE: ReadonlyMap<string, readonly NewsNearTrade[]> = new Map();

/**
 * The saved big news near the closed trades on screen, by trade id, in one read. No database, no closed trade or a failed
 * read gives an empty map (the card then shows nothing); a slow old answer never replaces a newer one.
 */
export function useNewsNearTrades(db: KairosDatabase | undefined, trades: readonly NewsNearTradesInput[]): ReadonlyMap<string, readonly NewsNearTrade[]> {
  const [near, setNear] = useState<ReadonlyMap<string, readonly NewsNearTrade[]>>(NONE);
  const request = useRef(0);
  const key = trades
    .filter((trade) => trade.status === 'closed')
    .map((trade) => `${trade.id}|${trade.openedAt ?? ''}|${trade.closedAt ?? ''}`)
    .join('\n');

  useEffect(() => {
    const current = ++request.current;
    if (!db || key === '') { setNear(NONE); return; }
    const closed = key.split('\n').map((line) => {
      const [id, openedAt, closedAt] = line.split('|');
      return { id, status: 'closed' as const, openedAt: openedAt || null, closedAt: closedAt || null };
    });
    loadNewsNearTrades(db, closed).then(
      (map) => { if (current === request.current) setNear(map); },
      () => { if (current === request.current) setNear(NONE); },
    );
    // A read that finishes after unmount or a newer request is dropped.
    return () => { request.current += 1; };
  }, [db, key]);

  return near;
}
