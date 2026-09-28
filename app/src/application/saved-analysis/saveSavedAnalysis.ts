import type { SavedAnalysis, SavedAnalysisId } from '../../domain/saved-records/savedAnalysisContract';
import { createSavedAnalysisId } from '../../domain/saved-records/savedAnalysisIdentity';
import { normalizeSavedRecordLabel } from '../../domain/saved-records/savedRecordLabel';
import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { runKairosAtomicWrite } from '../../data/database/transactions';

export type SaveSavedAnalysisInput = Omit<SavedAnalysis, 'id'>;

export type SaveSavedAnalysisResult =
  | {
      readonly ok: true;
      readonly savedAnalysisId: SavedAnalysisId;
    }
  | {
      readonly ok: false;
      readonly type: 'invalid-input';
      readonly reason: 'saved-analysis-label-invalid';
    }
  | {
      readonly ok: false;
      readonly type: 'storage-error';
      readonly reason: 'saved-analysis-save-failed';
    };

/**
 * P20.3 Saved Analysis application save orchestration.
 *
 * Owns only fresh-id allocation + one atomic repository write.
 * Saved Analysis logical truth remains owned by P20.1; raw persistence
 * remains owned by P20.2.
 */
export async function saveSavedAnalysis(
  db: KairosDatabase,
  input: SaveSavedAnalysisInput,
): Promise<SaveSavedAnalysisResult> {
  const label = normalizeSavedRecordLabel(input.label);
  if (label.kind === 'invalid') return { ok: false, type: 'invalid-input', reason: 'saved-analysis-label-invalid' };
  const savedAnalysisId = createSavedAnalysisId();
  const record: SavedAnalysis = Object.freeze({
    id: savedAnalysisId,
    market: structuredClone(input.market),
    drawings: Object.freeze(structuredClone(input.drawings)),
    riskRewards: Object.freeze(structuredClone(input.riskRewards)),
    ...(label.kind === 'label' ? { label: label.label } : {}),
  });

  try {
    await runKairosAtomicWrite(db, ['savedAnalyses'], async ({ repositories }) => {
      await repositories.savedAnalyses.put(record);
    });
  } catch {
    return {
      ok: false,
      type: 'storage-error',
      reason: 'saved-analysis-save-failed',
    };
  }

  return { ok: true, savedAnalysisId };
}
