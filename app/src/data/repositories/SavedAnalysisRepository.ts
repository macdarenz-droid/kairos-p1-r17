import type { SavedAnalysis, SavedAnalysisId } from '../../app/savedAnalysisContract';
import type { KairosDatabase } from '../database/KairosDatabase';

export class SavedAnalysisRepository {
  constructor(private readonly db: KairosDatabase) {}
  get(id: SavedAnalysisId) { return this.db.savedAnalyses.get(id); }
  listAll() { return this.db.savedAnalyses.toArray(); }
  put(record: SavedAnalysis) { return this.db.savedAnalyses.put(record).then(() => undefined); }
  delete(id: SavedAnalysisId) { return this.db.savedAnalyses.delete(id); }
  async replaceAll(records: readonly SavedAnalysis[]) {
    await this.db.savedAnalyses.clear();
    if (records.length) await this.db.savedAnalyses.bulkPut(records.map((record) => structuredClone(record)));
  }
}
