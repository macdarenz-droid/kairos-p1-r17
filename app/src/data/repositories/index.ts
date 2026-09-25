import { kairosDatabase } from '../database/databaseLifecycle';
import type { KairosDatabase } from '../database/KairosDatabase';
import { ExchangeRateRepository } from './ExchangeRateRepository';
import { MetadataRepository } from './MetadataRepository';
import { SavedAnalysisRepository } from './SavedAnalysisRepository';
import { SavedTimeAssistedSnapshotRepository } from './SavedTimeAssistedSnapshotRepository';
import { TradeDisciplineRepository } from './TradeDisciplineRepository';
import { TradeExecutionRepository, TradeFeeRepository, TradePlanRepository, TradeRepository } from './TradeRepositories';

export interface KairosRepositories {
  readonly metadata: MetadataRepository;
  readonly trades: TradeRepository;
  readonly tradePlans: TradePlanRepository;
  readonly tradeExecutions: TradeExecutionRepository;
  readonly tradeFees: TradeFeeRepository;
  readonly savedAnalyses: SavedAnalysisRepository;
  readonly savedTimeAssistedSnapshots: SavedTimeAssistedSnapshotRepository;
  readonly tradeDiscipline: TradeDisciplineRepository;
  readonly exchangeRates: ExchangeRateRepository;
}
export function createKairosRepositories(db: KairosDatabase): KairosRepositories {
  return Object.freeze({ metadata: new MetadataRepository(db), trades: new TradeRepository(db), tradePlans: new TradePlanRepository(db), tradeExecutions: new TradeExecutionRepository(db), tradeFees: new TradeFeeRepository(db), savedAnalyses: new SavedAnalysisRepository(db), savedTimeAssistedSnapshots: new SavedTimeAssistedSnapshotRepository(db), tradeDiscipline: new TradeDisciplineRepository(db), exchangeRates: new ExchangeRateRepository(db) });
}
export const kairosRepositories = createKairosRepositories(kairosDatabase);
export { ExchangeRateRepository } from './ExchangeRateRepository';
export { MetadataRepository } from './MetadataRepository';
export { SavedAnalysisRepository } from './SavedAnalysisRepository';
export { SavedTimeAssistedSnapshotRepository } from './SavedTimeAssistedSnapshotRepository';
export { TradeDisciplineRepository } from './TradeDisciplineRepository';
export { TradeExecutionRepository, TradeFeeRepository, TradePlanRepository, TradeRepository } from './TradeRepositories';
export { KAIROS_DEVICE_METADATA_PREFIX, isKairosDeviceScopedMetadataKey } from './metadataScope';
