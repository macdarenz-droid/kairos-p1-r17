import { loadSavedAnalysis, saveSavedAnalysis, type LoadSavedAnalysisResult, type SaveSavedAnalysisResult } from '../application/saved-analysis';
import { deleteSavedAnalysis, type DeleteSavedAnalysisResult } from '../application/saved-analysis';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import { createKairosRepositories } from '../data/repositories';
import type { ChartDrawing, ChartMarketReference } from '../features/chart';
import type { MarketDataInstrument } from '../services/market-data/marketDataTypes';
import type { SavedAnalysisId } from '../domain/saved-records/savedAnalysisContract';

export interface AnalysisSavedAnalysisSummary {
  readonly id: SavedAnalysisId;
  readonly drawingCount: number;
  /** How many of the drawings are zones; present only when above 0. */
  readonly zoneCount?: number;
  /** P25 optional user-given label, present only when the record carries one. */
  readonly label?: string;
}

/** Save, list and load Saved Analyses for one exact market through the released P20 owners. */
export interface AnalysisSavedAnalysisPorts {
  save(market: ChartMarketReference, drawings: readonly ChartDrawing[], label?: string): Promise<SaveSavedAnalysisResult>;
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
 * exact market, P20.4 load-one-by-id. Drawings are the only Saved Analysis
 * content here: saved-trade overlays stay derived from the journal, so
 * `riskRewards` is left empty rather than duplicating journal truth.
 */
export function createAnalysisSavedAnalysisPorts(db: KairosDatabase = kairosDatabase): AnalysisSavedAnalysisPorts {
  return {
    save(market, drawings, label) {
      return saveSavedAnalysis(db, { market, drawings, riskRewards: [], ...(label === undefined ? {} : { label }) });
    },
    async list(market) {
      const records = await createKairosRepositories(db).savedAnalyses.listAll();
      return records.filter(record => sameMarket(record.market, market)).map((record) => {
        const zoneCount = record.drawings.filter(drawing => drawing.kind === 'zone').length;
        return Object.freeze({ id: record.id, drawingCount: record.drawings.length, ...(zoneCount > 0 ? { zoneCount } : {}), ...(record.label === undefined ? {} : { label: record.label }) });
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
