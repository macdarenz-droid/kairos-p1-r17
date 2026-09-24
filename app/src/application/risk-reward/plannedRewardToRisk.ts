import { decimalSubtract } from '../../domain/calculations/decimalKernel';
import { calculateRMultiple } from '../../domain/calculations/rMultipleCalculator';
import { calculateRiskPriceDistance } from '../../domain/calculations/riskCalculator';
import type { DecimalString, TradeSide } from '../../domain/trades';

export type PlannedRewardToRiskUnavailableReason = 'invalid-decimal' | 'levels-not-ordered' | 'zero-risk-distance';

export interface PlannedRewardToRisk {
  /** |entry − stop| through the risk-distance owner. */
  readonly riskDistance: DecimalString;
  /** |target − entry| through the same owner. */
  readonly rewardDistance: DecimalString;
  /** rewardDistance ÷ riskDistance through the R-multiple owner; read as 1 : ratio. */
  readonly ratio: DecimalString;
}

export type PlannedRewardToRiskResult =
  | { readonly ok: true; readonly value: PlannedRewardToRisk }
  | { readonly ok: false; readonly reason: PlannedRewardToRiskUnavailableReason };

/** Sign of a kernel decimal: kernel output is normalized, so a '-' prefix and '0' are exact. */
const sign = (value: DecimalString): -1 | 0 | 1 => (value === '0' ? 0 : value.startsWith('-') ? -1 : 1);

const unavailable = (reason: PlannedRewardToRiskUnavailableReason): PlannedRewardToRiskResult => Object.freeze({ ok: false, reason });

/**
 * The one owner of the planned reward-to-risk (golden rule 2). The stop must
 * sit on the loss side of the entry and the target on the profit side for the
 * trade's side; equal levels fail closed. Every number comes from the decimal
 * kernel, risk-distance and R-multiple owners; nothing is rounded.
 */
export function projectPlannedRewardToRisk(side: TradeSide, entry: DecimalString, stop: DecimalString, target: DecimalString): PlannedRewardToRiskResult {
  const stopFromEntry = decimalSubtract(stop, entry);
  const targetFromEntry = decimalSubtract(target, entry);
  if (!stopFromEntry.ok || !targetFromEntry.ok) return unavailable('invalid-decimal');
  const stopSide = sign(stopFromEntry.value), targetSide = sign(targetFromEntry.value);
  const ordered = side === 'long' ? stopSide < 0 && targetSide > 0 : stopSide > 0 && targetSide < 0;
  if (!ordered) return unavailable('levels-not-ordered');
  const riskDistance = calculateRiskPriceDistance(entry, stop);
  if (!riskDistance.ok) return unavailable('invalid-decimal');
  if (riskDistance.value === '0') return unavailable('zero-risk-distance');
  const rewardDistance = calculateRiskPriceDistance(target, entry);
  if (!rewardDistance.ok) return unavailable('invalid-decimal');
  const ratio = calculateRMultiple(rewardDistance.value, riskDistance.value);
  if (!ratio.ok) return unavailable(ratio.reason === 'zero-initial-risk' ? 'zero-risk-distance' : 'invalid-decimal');
  return Object.freeze({ ok: true, value: Object.freeze({ riskDistance: riskDistance.value, rewardDistance: rewardDistance.value, ratio: ratio.value }) });
}
