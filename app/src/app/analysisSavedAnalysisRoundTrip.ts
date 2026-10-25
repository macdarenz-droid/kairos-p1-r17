import { loadSavedAnalysis, saveSavedAnalysis, type LoadSavedAnalysisResult, type SaveSavedAnalysisResult } from '../application/saved-analysis';
import { deleteSavedAnalysis, type DeleteSavedAnalysisResult } from '../application/saved-analysis';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import { createKairosRepositories } from '../data/repositories';
import type { ChartDrawing, ChartMarketReference } from '../features/chart';
import type { MarketDataInstrument } from '../services/market-data/marketDataTypes';
import type { SavedAnalysisId, SavedRiskRewardAnalysis } from '../domain/saved-records/savedAnalysisContract';

export interface AnalysisSavedAnalysisSummary {
  readonly id: SavedAnalysisId;
  readonly drawingCount: number;
  /** How many of the drawings are zones; present only when above 0. */
  readonly zoneCount?: number;
  /** How many user risk boxes the record holds; present only when above 0. */
  readonly riskBoxCount?: number;
  /** P25 optional user-given label, present only when the record carries one. */
  readonly label?: string;
}

/** Save, list and load Saved Analyses for one exact market through the released P20 owners. */
export interface AnalysisSavedAnalysisPorts {
  save(market: ChartMarketReference, drawings: readonly ChartDrawing[], label?: string, riskRewards?: readonly SavedRiskRewardAnalysis[]): Promise<SaveSavedAnalysisResult>;
  list(market: ChartMarketReference): Promise<readonly AnalysisSavedAnalysisSummary[]>;
  load(savedAnalysisId: SavedAnalysisId): Promise<LoadSavedAnalysisResult>;
  /** P24.1 delete-one; the released P20 owners above are unchanged. */
  remove(savedAnalysisId: SavedAnalysisId): Promise<DeleteSavedAnalysisResult>;
}

/** The exact Analysis selection as the released chart market reference (venue + instrument symbol). */
export function analysisMarketReference(instrument: MarketDataInstrument): ChartMarketReference {
  return Object.freeze({ venue: instrument.venue, instrument: instrument.symbol, source: 'market-reference' as const });
}

const sameMarket = (a: ChartMarketReference, b: ChartMarketReference): boolean => a.venue === b.venue && a.instrument === b.instrument && a.source === b.source;

/**
 * P20.3 save (one atomic write, fresh id), P20.2 repository listing filtered to the
 * exact market, P20.4 load-one-by-id. The user's drawings and their own risk
 * boxes are saved; the boxes go in `riskRewards`. A saved trade's box is never
 * saved: it is drawn from the journal and never enters the drawing session.
 */
export function createAnalysisSavedAnalysisPorts(db: KairosDatabase = kairosDatabase): AnalysisSavedAnalysisPorts {
  return {
    save(market, drawings, label, riskRewards) {
      return saveSavedAnalysis(db, { market, drawings, riskRewards: riskRewards ?? [], ...(label === undefined ? {} : { label }) });
    },
    async list(market) {
      const records = await createKairosRepositories(db).savedAnalyses.listAll();
      return records.filter(record => sameMarket(record.market, market)).map((record) => {
        const zoneCount = record.drawings.filter(drawing => drawing.kind === 'zone').length;
        const riskBoxCount = record.riskRewards.length;
        return Object.freeze({ id: record.id, drawingCount: record.drawings.length, ...(zoneCount > 0 ? { zoneCount } : {}), ...(riskBoxCount > 0 ? { riskBoxCount } : {}), ...(record.label === undefined ? {} : { label: record.label }) });
      });
    },
    load(savedAnalysisId) {
      return loadSavedAnalysis(db, savedAnalysisId);
    },
    remove(savedAnalysisId) {
      return deleteSavedAnalysis(db, savedAnalysisId);
    },
  };
}

export const analysisSavedAnalysisPorts: AnalysisSavedAnalysisPorts = createAnalysisSavedAnalysisPorts();
