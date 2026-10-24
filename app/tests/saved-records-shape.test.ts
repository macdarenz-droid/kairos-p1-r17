import { describe, expectTypeOf, it } from 'vitest';
import type { RiskRewardChartTimeExtent } from '../src/app/riskRewardChartPlacementProjection';
import type { EstimatedMarketReference, TimeAssistedTradeSide } from '../src/application/market-reference';
import type { RiskRewardAnalysis } from '../src/application/risk-reward';
import type {
  StoredChartDrawing,
  StoredChartMarketReference,
  StoredEstimatedMarketReference,
  StoredRiskRewardAnalysis,
  StoredRiskRewardChartTimeExtent,
  StoredTimeAssistedTradeSide,
} from '../src/domain/saved-records';
import type { ChartDrawing, ChartMarketReference } from '../src/features/chart';

// These are compile-time checks: `npm run typecheck` fails when a stored shape and its runtime owner drift apart.
describe('stored saved-record shapes match their runtime owners', () => {
  it('chart drawing and market reference', () => {
    expectTypeOf<StoredChartDrawing>().toEqualTypeOf<ChartDrawing>();
    expectTypeOf<StoredChartMarketReference>().toEqualTypeOf<ChartMarketReference>();
  });

  it('Risk/Reward analysis and its chart time extent', () => {
    expectTypeOf<StoredRiskRewardAnalysis>().toEqualTypeOf<RiskRewardAnalysis>();
    expectTypeOf<StoredRiskRewardChartTimeExtent>().toEqualTypeOf<RiskRewardChartTimeExtent>();
  });

  it('estimated market reference and time-assisted side', () => {
    expectTypeOf<StoredEstimatedMarketReference>().toEqualTypeOf<EstimatedMarketReference>();
    expectTypeOf<StoredTimeAssistedTradeSide>().toEqualTypeOf<TimeAssistedTradeSide>();
  });
});
