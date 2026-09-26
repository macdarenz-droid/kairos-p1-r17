import { projectPlannedRewardToRisk, type RiskRewardAnalysis } from '../application/risk-reward';
import { decimalSubtract } from '../domain/calculations/decimalKernel';
import { calculateRMultiple } from '../domain/calculations/rMultipleCalculator';
import type { DecimalString, TradeSide } from '../domain/trades';

export type AnalysisSavedTradeRiskRewardRatioUnavailableReason =
  | 'invalid-decimal'
  | 'zero-risk-distance'
  | 'levels-not-ordered';

export type AnalysisSavedTradeRiskRewardLiveRUnavailableReason =
  | 'last-close-missing'
  | 'invalid-decimal';

export interface AnalysisSavedTradeRiskRewardPlannedRatio {
  /** |entry − stop| through the released risk-distance owner. */
  readonly riskDistance: DecimalString;
  /** |target − entry| through the released decimal kernel. */
  readonly rewardDistance: DecimalString;
  /** rewardDistance ÷ riskDistance through the released R-multiple owner; read as 1 : ratio. */
  readonly ratio: DecimalString;
}

export type AnalysisSavedTradeRiskRewardLiveR =
  | { readonly kind: 'unavailable'; readonly reason: AnalysisSavedTradeRiskRewardLiveRUnavailableReason }
  | {
      readonly kind: 'live-r-ready';
      /** The exact authoritative last close the caller supplied; never inspected from candles here. */
      readonly lastClose: DecimalString;
      /** Signed open R at that close: (close − entry) ÷ riskDistance for long, (entry − close) ÷ riskDistance for short. */
      readonly rMultiple: DecimalString;
    };

export type AnalysisSavedTradeRiskRewardRatioProjection =
  | { readonly kind: 'unavailable'; readonly reason: AnalysisSavedTradeRiskRewardRatioUnavailableReason }
  | {
      readonly kind: 'ratio-ready';
      readonly side: TradeSide;
      readonly levels: RiskRewardAnalysis['levels'];
      readonly planned: AnalysisSavedTradeRiskRewardPlannedRatio;
      readonly live: AnalysisSavedTradeRiskRewardLiveR;
    };

const unavailable = (reason: AnalysisSavedTradeRiskRewardRatioUnavailableReason): AnalysisSavedTradeRiskRewardRatioProjection => Object.freeze({ kind: 'unavailable', reason });

/** Sign of a released-kernel decimal: kernel output is normalized, so '-' prefix and '0' are exact. */
const sign = (value: DecimalString): -1 | 0 | 1 => value === '0' ? 0 : value.startsWith('-') ? -1 : 1;

function liveR(side: TradeSide, entry: DecimalString, riskDistance: DecimalString, lastClose: DecimalString | null): AnalysisSavedTradeRiskRewardLiveR {
  if (lastClose === null) return Object.freeze({ kind: 'unavailable', reason: 'last-close-missing' });
  const excursion = side === 'long' ? decimalSubtract(lastClose, entry) : decimalSubtract(entry, lastClose);
  if (!excursion.ok) return Object.freeze({ kind: 'unavailable', reason: 'invalid-decimal' });
  const rMultiple = calculateRMultiple(excursion.value, riskDistance);
  if (!rMultiple.ok) return Object.freeze({ kind: 'unavailable', reason: 'invalid-decimal' });
  return Object.freeze({ kind: 'live-r-ready', lastClose, rMultiple: rMultiple.value });
}

/**
 * Exact planned Risk/Reward ratio and signed live R for one released Risk/Reward analysis.
 * Every number comes from the released decimal kernel, risk-distance and R-multiple owners;
 * nothing is rounded, inferred or read from candles. Missing or inverted evidence fails closed.
 */
export function projectAnalysisSavedTradeRiskRewardRatio(
  analysis: RiskRewardAnalysis,
  lastClose: DecimalString | null,
): AnalysisSavedTradeRiskRewardRatioProjection {
  const planned = projectPlannedRewardToRisk(analysis.side, analysis.levels.entry, analysis.levels.stop, analysis.levels.target);
  if (!planned.ok) return unavailable(planned.reason);
  return Object.freeze({
    kind: 'ratio-ready',
    side: analysis.side,
    levels: analysis.levels,
    planned: planned.value,
    live: liveR(analysis.side, analysis.levels.entry, planned.value.riskDistance, lastClose),
  });
}
