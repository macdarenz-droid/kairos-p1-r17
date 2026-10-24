import type { SavedAnalysisId } from '../../domain/saved-records/savedAnalysisContract';
import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { runKairosAtomicWrite } from '../../data/database/transactions';

export type DeleteSavedAnalysisResult =
  | { readonly ok: true; readonly savedAnalysisId: SavedAnalysisId }
  | { readonly ok: false; readonly type: 'not-found'; readonly reason: 'saved-analysis-not-found' }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'saved-analysis-delete-failed' };

/**
 * P24.1 Saved Analysis application delete orchestration.
 *
 * Owns only the removal of one Saved Analysis by its canonical stable id inside
 * one atomic write: the record is read and deleted in the same transaction, so a
 * missing record is an explicit not-found result and never a silent no-op.
 * Nothing else is touched: no journal record, no saved snapshot, no backup.
 */
export async function deleteSavedAnalysis(db: KairosDatabase, savedAnalysisId: SavedAnalysisId): Promise<DeleteSavedAnalysisResult> {
  try {
    const existed = await runKairosAtomicWrite(db, ['savedAnalyses'], async ({ repositories }) => {
      const record = await repositories.savedAnalyses.get(savedAnalysisId);
      if (!record) return false;
      await repositories.savedAnalyses.delete(savedAnalysisId);
      return true;
    });
    if (!existed) return { ok: false, type: 'not-found', reason: 'saved-analysis-not-found' };
    return { ok: true, savedAnalysisId };
  } catch {
    return { ok: false, type: 'storage-error', reason: 'saved-analysis-delete-failed' };
  }
}
