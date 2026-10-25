import type { SavedAnalysis, SavedAnalysisId } from '../../domain/saved-records/savedAnalysisContract';
import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { createKairosRepositories } from '../../data/repositories';

export type LoadSavedAnalysisResult =
  | {
      readonly ok: true;
      readonly savedAnalysis: SavedAnalysis;
    }
  | {
      readonly ok: false;
      readonly type: 'not-found';
      readonly reason: 'saved-analysis-not-found';
    }
  | {
      readonly ok: false;
      readonly type: 'storage-error';
      readonly reason: 'saved-analysis-load-failed';
    };

/**
 * P20.4 Saved Analysis application load orchestration.
 *
 * Owns only a single-record read by the canonical SavedAnalysisId boundary.
 * Logical Saved Analysis truth remains P20.1; raw persistence remains P20.2;
 * save orchestration remains P20.3.
 */
export async function loadSavedAnalysis(
  db: KairosDatabase,
  savedAnalysisId: SavedAnalysisId,
): Promise<LoadSavedAnalysisResult> {
  try {
    const record = await createKairosRepositories(db).savedAnalyses.get(savedAnalysisId);
    if (!record) {
      return {
        ok: false,
        type: 'not-found',
        reason: 'saved-analysis-not-found',
      };
    }
    return {
      ok: true,
      savedAnalysis: structuredClone(record),
    };
  } catch {
    return {
      ok: false,
      type: 'storage-error',
      reason: 'saved-analysis-load-failed',
    };
  }
}
