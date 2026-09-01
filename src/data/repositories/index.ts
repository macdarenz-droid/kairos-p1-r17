import { kairosDatabase } from '../database/databaseLifecycle';
import type { KairosDatabase } from '../database/KairosDatabase';
import { MetadataRepository } from './MetadataRepository';
import { TradeExecutionRepository, TradeFeeRepository, TradePlanRepository, TradeRepository } from './TradeRepositories';

export interface KairosRepositories {
  readonly metadata: MetadataRepository;
  readonly trades: TradeRepository;
  readonly tradePlans: TradePlanRepository;
  readonly tradeExecutions: TradeExecutionRepository;
  readonly tradeFees: TradeFeeRepository;
}
export function createKairosRepositories(db: KairosDatabase): KairosRepositories {
  return Object.freeze({ metadata: new MetadataRepository(db), trades: new TradeRepository(db), tradePlans: new TradePlanRepository(db), tradeExecutions: new TradeExecutionRepository(db), tradeFees: new TradeFeeRepository(db) });
}
export const kairosRepositories = createKairosRepositories(kairosDatabase);
export { MetadataRepository } from './MetadataRepository';
export { TradeExecutionRepository, TradeFeeRepository, TradePlanRepository, TradeRepository } from './TradeRepositories';
export { KAIROS_DEVICE_METADATA_PREFIX, isKairosDeviceScopedMetadataKey } from './metadataScope';
