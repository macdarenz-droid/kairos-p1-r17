import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { runKairosAtomicWrite } from '../../data/database/transactions';
import { validateTradeFields, type TradeId, type TradeRecord, type TradeSource } from '../../domain/trades';
import { JOURNAL_HISTORY_SOURCES, type JournalHistoryScope } from '../journal/historyQuery';
import type { EditSavedTradeConflict } from './editSavedTrade';
import { tradeRevision } from './tradeRevision';

export interface SaveTradeNoteInput {
  readonly tradeId: TradeId;
  /** `tradeRevision` of the trade with its entries, exits, fees and plan versions, as the page showed it. */
  readonly expectedRevision: string;
  /** As typed; blank removes the note. */
  readonly note: string;
  readonly scope: JournalHistoryScope;
}

export type SaveTradeNoteResult =
  | Readonly<{ ok: true; note: string | null }>
  | Readonly<{ ok: false; type: 'validation-error'; field: 'note'; reason: 'invalid-note' }>
  | Exclude<EditSavedTradeConflict, { reason: 'trade-not-editable' }>
  | Readonly<{ ok: false; type: 'storage-error'; reason: 'trade-save-failed' }>;

/**
 * U15 (D265): the trade's own note, for every trade of the list, Replay's included. It is trimmed, at most 2,000
 * characters; a blank note removes it. A stale page (another tab saved first) is refused, and a note that didn't
 * change writes nothing.
 */
export async function saveTradeNote(db: KairosDatabase, input: SaveTradeNoteInput, dependencies: { readonly now?: () => string } = {}): Promise<SaveTradeNoteResult> {
  const note = input.note.trim();
  if (note !== '' && !validateTradeFields({ note }).ok) return { ok: false, type: 'validation-error', field: 'note', reason: 'invalid-note' };
  const now = dependencies.now ?? (() => new Date().toISOString());
  try {
    return await runKairosAtomicWrite(db, ['trades', 'tradePlans', 'tradeExecutions', 'tradeFees'], async ({ repositories: r }): Promise<SaveTradeNoteResult> => {
      const saved = await r.trades.get(input.tradeId);
      if (!saved || !(JOURNAL_HISTORY_SOURCES[input.scope] as readonly TradeSource[]).includes(saved.source)) return { ok: false, type: 'update-conflict', reason: 'trade-missing' };
      const [plans, executions, fees] = await Promise.all([r.tradePlans.listByTradeId(saved.id), r.tradeExecutions.listByTradeId(saved.id), r.tradeFees.listByTradeId(saved.id)]);
      if (tradeRevision({ trade: saved, executions, fees, plans }) !== input.expectedRevision) return { ok: false, type: 'update-conflict', reason: 'trade-changed' };
      if ((saved.note ?? '') === note) return { ok: true, note: note === '' ? null : note };
      // No note is an absent key, never null or "" (restore verification compares records exactly).
      const { note: _old, ...rest } = saved;
      const next: TradeRecord = { ...rest, ...(note !== '' ? { note } : {}), updatedAt: now() };
      await r.trades.put(next);
      return { ok: true, note: note === '' ? null : note };
    });
  } catch {
    return { ok: false, type: 'storage-error', reason: 'trade-save-failed' };
  }
}
