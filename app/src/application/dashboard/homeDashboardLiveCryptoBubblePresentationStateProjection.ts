import { decimalAbs, decimalSubtract } from '../../domain/calculations';
import { parseDecimalString, type DecimalString } from '../../domain/trades';
import type {
  LiveCryptoBubbleMetricInputProjectionEntry,
  LiveCryptoBubbleMetricInputProjectionResult,
} from '../../services/market-data';
import type { HomeDashboardLiveCryptoBubbleMetricObservation } from './homeDashboardLiveCryptoBubbleMetricObservationBridge';

export type HomeDashboardLiveCryptoBubbleMetricAvailability = 'present' | 'missing';
export type HomeDashboardLiveCryptoBubbleMovementSemantic = 'positive' | 'negative' | 'neutral';
export type HomeDashboardLiveCryptoBubbleFreshnessPresentationState =
  | 'missing'
  | Exclude<LiveCryptoBubbleMetricInputProjectionEntry['freshness'], null>;

export interface HomeDashboardLiveCryptoBubblePresentationPolicy {
  readonly neutralMaxAbsoluteMovementPercent: DecimalString;
}

export interface HomeDashboardLiveCryptoBubblePresentationStateEntry {
  readonly metricInput: LiveCryptoBubbleMetricInputProjectionEntry;
  readonly availability: HomeDashboardLiveCryptoBubbleMetricAvailability;
  readonly movementSemantic: HomeDashboardLiveCryptoBubbleMovementSemantic | null;
  readonly freshnessState: HomeDashboardLiveCryptoBubbleFreshnessPresentationState;
}

type BubbleMetricProjectionFailure = Extract<
  LiveCryptoBubbleMetricInputProjectionResult,
  { readonly ok: false }
>;

export type HomeDashboardLiveCryptoBubblePresentationStateProjectionResult =
  | {
      readonly ok: true;
      readonly metricObservation: HomeDashboardLiveCryptoBubbleMetricObservation;
      readonly entries: readonly HomeDashboardLiveCryptoBubblePresentationStateEntry[];
    }
  | {
      readonly ok: false;
      readonly reason: 'bubble-metric-projection-invalid';
      readonly metricObservation: HomeDashboardLiveCryptoBubbleMetricObservation;
      readonly bubbleMetricProjection: BubbleMetricProjectionFailure;
    }
  | {
      readonly ok: false;
      readonly reason: 'neutral-threshold-invalid';
      readonly metricObservation: HomeDashboardLiveCryptoBubbleMetricObservation;
    }
  | {
      readonly ok: false;
      readonly reason: 'metric-entry-inconsistent' | 'movement-semantic-derivation-invalid';
      readonly metricObservation: HomeDashboardLiveCryptoBubbleMetricObservation;
      readonly entryIndex: number;
    };

function classifyMovement(
  movementPercent24h: DecimalString,
  neutralMaxAbsoluteMovementPercent: DecimalString,
): HomeDashboardLiveCryptoBubbleMovementSemantic | null {
  const magnitude = decimalAbs(movementPercent24h);
  if (!magnitude.ok) return null;

  const relativeToNeutralLimit = decimalSubtract(
    magnitude.value,
    neutralMaxAbsoluteMovementPercent,
  );
  if (!relativeToNeutralLimit.ok) return null;

  if (relativeToNeutralLimit.value === '0' || relativeToNeutralLimit.value.startsWith('-')) {
    return 'neutral';
  }
  return movementPercent24h.startsWith('-') ? 'negative' : 'positive';
}

/**
 * Provider-neutral semantic presentation-state projection for one released Home
 * Live Crypto Bubble metric observation. It preserves exact metric/freshness
 * truth and classifies only availability, movement meaning, and freshness state.
 * Styling, radius/geometry, React lifecycle, and runtime ownership remain outside.
 */
export function projectHomeDashboardLiveCryptoBubblePresentationState(
  metricObservation: HomeDashboardLiveCryptoBubbleMetricObservation,
  policy: HomeDashboardLiveCryptoBubblePresentationPolicy,
): HomeDashboardLiveCryptoBubblePresentationStateProjectionResult {
  if (!metricObservation.bubbleMetricProjection.ok) {
    return {
      ok: false,
      reason: 'bubble-metric-projection-invalid',
      metricObservation,
      bubbleMetricProjection: metricObservation.bubbleMetricProjection,
    };
  }

  const threshold = parseDecimalString(String(policy.neutralMaxAbsoluteMovementPercent));
  if (!threshold.ok || threshold.value.startsWith('-')) {
    return { ok: false, reason: 'neutral-threshold-invalid', metricObservation };
  }

  const entries: HomeDashboardLiveCryptoBubblePresentationStateEntry[] = [];
  for (let entryIndex = 0; entryIndex < metricObservation.bubbleMetricProjection.entries.length; entryIndex += 1) {
    const metricInput = metricObservation.bubbleMetricProjection.entries[entryIndex];

    if (metricInput.fact === null) {
      if (
        metricInput.ageMs !== null ||
        metricInput.freshness !== null ||
        metricInput.quoteVolume24h !== null ||
        metricInput.movementPercent24h !== null
      ) {
        return { ok: false, reason: 'metric-entry-inconsistent', metricObservation, entryIndex };
      }
      entries.push({
        metricInput,
        availability: 'missing',
        movementSemantic: null,
        freshnessState: 'missing',
      });
      continue;
    }

    if (
      metricInput.ageMs === null ||
      metricInput.freshness === null ||
      metricInput.quoteVolume24h === null ||
      metricInput.movementPercent24h === null
    ) {
      return { ok: false, reason: 'metric-entry-inconsistent', metricObservation, entryIndex };
    }

    const movementSemantic = classifyMovement(
      metricInput.movementPercent24h,
      threshold.value,
    );
    if (movementSemantic === null) {
      return {
        ok: false,
        reason: 'movement-semantic-derivation-invalid',
        metricObservation,
        entryIndex,
      };
    }

    entries.push({
      metricInput,
      availability: 'present',
      movementSemantic,
      freshnessState: metricInput.freshness,
    });
  }

  return {
    ok: true,
    metricObservation,
    entries,
  };
}
