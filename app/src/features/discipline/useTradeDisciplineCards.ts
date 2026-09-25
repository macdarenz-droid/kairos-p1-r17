import { useCallback, useEffect, useRef, useState } from 'react';
import { loadTradeDisciplineCards } from '../../application/discipline';
import type { KairosDatabase } from '../../data/database';
import type { DisciplineLists, Strategy, TradeDisciplineRecord } from '../../domain/discipline';

export type TradeDisciplineCardsState =
  | Readonly<{ kind: 'off' }>
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'failed' }>
  | Readonly<{ kind: 'ready'; lists: DisciplineLists; records: ReadonlyMap<string, TradeDisciplineRecord>; strategies: readonly Strategy[] }>;

const OFF: TradeDisciplineCardsState = Object.freeze({ kind: 'off' });
const LOADING: TradeDisciplineCardsState = Object.freeze({ kind: 'loading' });
const FAILED: TradeDisciplineCardsState = Object.freeze({ kind: 'failed' });

/**
 * Reads the discipline lists and the records of the trades on screen in one
 * batch. Only the first load shows `loading`; a reload keeps the last ready
 * data until the new data arrives, and a slow old answer never replaces a newer one.
 */
export function useTradeDisciplineCards(db: KairosDatabase | undefined, tradeIds: readonly string[]): { readonly state: TradeDisciplineCardsState; readonly remember: (record: TradeDisciplineRecord) => void } {
  const [state, setState] = useState<TradeDisciplineCardsState>(db ? LOADING : OFF);
  const request = useRef(0);
  const idsKey = tradeIds.join('\n');

  useEffect(() => {
    const current = ++request.current;
    if (!db) { setState(OFF); return; }
    setState(previous => (previous.kind === 'ready' ? previous : LOADING));
    const ids = idsKey === '' ? [] : idsKey.split('\n');
    loadTradeDisciplineCards(db, ids).then(
      data => { if (current === request.current) setState(Object.freeze({ kind: 'ready', lists: data.lists, records: data.records, strategies: data.strategies })); },
      () => { if (current === request.current) setState(FAILED); },
    );
    // A load that finishes after unmount or a newer request is dropped.
    return () => { request.current += 1; };
  }, [db, idsKey]);

  const remember = useCallback((record: TradeDisciplineRecord) => {
    setState(previous => {
      if (previous.kind !== 'ready') return previous;
      const records = new Map(previous.records);
      records.set(record.tradeId, record);
      return Object.freeze({ kind: 'ready', lists: previous.lists, records, strategies: previous.strategies });
    });
  }, []);

  return { state, remember };
}
