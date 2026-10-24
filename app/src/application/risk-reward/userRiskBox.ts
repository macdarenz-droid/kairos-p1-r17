import { decimalSubtract } from '../../domain/calculations/decimalKernel';
import type { SavedRiskRewardAnalysis } from '../../domain/saved-records/savedAnalysisContract';
import type { DecimalString, TradeSide } from '../../domain/trades';
import { projectPlannedRewardToRisk } from './plannedRewardToRisk';

/** One chart tap: the same fields as the chart's drawing anchor (application code may not import features). */
export interface UserRiskBoxPoint {
  readonly timestamp: string;
  readonly price: DecimalString;
}

/** `start` is the entry at the left edge; `end` the stop and `target` the target, both at the right edge. */
export type UserRiskBoxHandle = 'start' | 'end' | 'target';
export type UserRiskBoxRefusal = 'invalid-time' | 'no-width' | 'invalid-decimal' | 'zero-risk-distance' | 'levels-not-ordered';
export type UserRiskBoxResult =
  | { readonly ok: true; readonly box: SavedRiskRewardAnalysis }
  | { readonly ok: false; readonly reason: UserRiskBoxRefusal };

const refuse = (reason: UserRiskBoxRefusal) => Object.freeze({ ok: false as const, reason });

/** Whether a stop tap can follow an entry tap, and which side it makes: below the entry is long, above is short. */
export function checkUserRiskBoxStop(entry: UserRiskBoxPoint, stop: UserRiskBoxPoint): { readonly ok: true; readonly side: TradeSide } | { readonly ok: false; readonly reason: UserRiskBoxRefusal } {
  const entryTime = Date.parse(entry.timestamp), stopTime = Date.parse(stop.timestamp);
  if (!Number.isFinite(entryTime) || !Number.isFinite(stopTime)) return refuse('invalid-time');
  if (entryTime === stopTime) return refuse('no-width');
  const stopFromEntry = decimalSubtract(stop.price, entry.price);
  if (!stopFromEntry.ok) return refuse('invalid-decimal');
  if (stopFromEntry.value === '0') return refuse('zero-risk-distance');
  return Object.freeze({ ok: true as const, side: stopFromEntry.value.startsWith('-') ? 'long' as const : 'short' as const });
}

function freezeBox(id: string, side: TradeSide, levels: SavedRiskRewardAnalysis['analysis']['levels'], start: string, end: string): SavedRiskRewardAnalysis {
  return Object.freeze({
    analysis: Object.freeze({ id, side, levels: Object.freeze({ ...levels }) }),
    extent: Object.freeze({ start, end }),
  });
}

/**
 * Turns three chart taps (entry, stop, target) into a box of the saved
 * `riskRewards` shape. The prices are kept exactly as given; the box is
 * accepted only when the planned reward-to-risk owner can read it. The
 * target's time is not used. The caller allocates the id.
 */
export function constructUserRiskBox(id: string, entry: UserRiskBoxPoint, stop: UserRiskBoxPoint, target: UserRiskBoxPoint): UserRiskBoxResult {
  const checked = checkUserRiskBoxStop(entry, stop);
  if (!checked.ok) return checked;
  const planned = projectPlannedRewardToRisk(checked.side, entry.price, stop.price, target.price);
  if (!planned.ok) return refuse(planned.reason);
  const entryFirst = Date.parse(entry.timestamp) < Date.parse(stop.timestamp);
  return Object.freeze({
    ok: true as const,
    box: freezeBox(id, checked.side, { entry: entry.price, stop: stop.price, target: target.price },
      entryFirst ? entry.timestamp : stop.timestamp, entryFirst ? stop.timestamp : entry.timestamp),
  });
}

/** Moves one handle of a placed box. The id and side never change, so a box never flips; a move that no longer fits is refused. */
export function moveUserRiskBoxHandle(box: SavedRiskRewardAnalysis, handle: UserRiskBoxHandle, point: UserRiskBoxPoint): UserRiskBoxResult {
  const { id, side, levels } = box.analysis;
  const start = handle === 'start' ? point.timestamp : box.extent.start;
  const end = handle === 'start' ? box.extent.end : point.timestamp;
  const startTime = Date.parse(start), endTime = Date.parse(end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return refuse('invalid-time');
  if (!(startTime < endTime)) return refuse('no-width');
  const moved = {
    entry: handle === 'start' ? point.price : levels.entry,
    stop: handle === 'end' ? point.price : levels.stop,
    target: handle === 'target' ? point.price : levels.target,
  };
  const planned = projectPlannedRewardToRisk(side, moved.entry, moved.stop, moved.target);
  if (!planned.ok) return refuse(planned.reason);
  return Object.freeze({ ok: true as const, box: freezeBox(id, side, moved, start, end) });
}
