import { decimalDivide, decimalSubtract } from '../../domain/calculations';
import { parseDecimalString, type DecimalString } from '../../domain/trades';
import type {
  HomeDashboardLiveCryptoBubblePresentationStateEntry,
  HomeDashboardLiveCryptoBubblePresentationStateProjectionResult,
} from './homeDashboardLiveCryptoBubblePresentationStateProjection';

type SuccessfulPresentationStateProjection = Extract<
  HomeDashboardLiveCryptoBubblePresentationStateProjectionResult,
  { readonly ok: true }
>;

type FailedPresentationStateProjection = Extract<
  HomeDashboardLiveCryptoBubblePresentationStateProjectionResult,
  { readonly ok: false }
>;

export interface HomeDashboardLiveCryptoBubbleAreaWeightProjectionEntry {
  readonly presentationEntry: HomeDashboardLiveCryptoBubblePresentationStateEntry;
  readonly areaWeight: DecimalString | null;
}

export type HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult =
  | {
      readonly ok: true;
      readonly presentationStateProjection: SuccessfulPresentationStateProjection;
      readonly entries: readonly HomeDashboardLiveCryptoBubbleAreaWeightProjectionEntry[];
    }
  | {
      readonly ok: false;
      readonly reason: 'presentation-state-projection-invalid';
      readonly presentationStateProjection: FailedPresentationStateProjection;
    }
  | {
      readonly ok: false;
      readonly reason: 'area-weight-entry-inconsistent' | 'area-weight-derivation-invalid';
      readonly presentationStateProjection: SuccessfulPresentationStateProjection;
      readonly entryIndex: number;
    };

function readPresentQuoteVolume(
  entry: HomeDashboardLiveCryptoBubblePresentationStateEntry,
): DecimalString | null {
  if (entry.availability !== 'present' || entry.metricInput.quoteVolume24h === null) return null;
  const parsed = parseDecimalString(String(entry.metricInput.quoteVolume24h));
  return parsed.ok && !parsed.value.startsWith('-') ? parsed.value : null;
}

/**
 * Provider-neutral presentation preparation for Live Crypto Bubble visual area.
 * It normalizes only already-released 24h quote-volume truth into a [0,1]
 * Decimal area weight. Pixel radius, minimum visible size, layout, theme, React,
 * provider/universe policy, and runtime ownership remain outside this boundary.
 */
export function projectHomeDashboardLiveCryptoBubbleAreaWeights(
  presentationStateProjection: HomeDashboardLiveCryptoBubblePresentationStateProjectionResult,
): HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult {
  if (!presentationStateProjection.ok) {
    return {
      ok: false,
      reason: 'presentation-state-projection-invalid',
      presentationStateProjection,
    };
  }

  let maximumPresentQuoteVolume: DecimalString | null = null;
  for (let entryIndex = 0; entryIndex < presentationStateProjection.entries.length; entryIndex += 1) {
    const entry = presentationStateProjection.entries[entryIndex];
    if (entry.availability === 'missing') {
      if (entry.metricInput.quoteVolume24h !== null) {
        return {
          ok: false,
          reason: 'area-weight-entry-inconsistent',
          presentationStateProjection,
          entryIndex,
        };
      }
      continue;
    }

    const quoteVolume = readPresentQuoteVolume(entry);
    if (quoteVolume === null) {
      return {
        ok: false,
        reason: 'area-weight-entry-inconsistent',
        presentationStateProjection,
        entryIndex,
      };
    }

    if (maximumPresentQuoteVolume === null) {
      maximumPresentQuoteVolume = quoteVolume;
      continue;
    }

    const relativeToMaximum = decimalSubtract(quoteVolume, maximumPresentQuoteVolume);
    if (!relativeToMaximum.ok) {
      return {
        ok: false,
        reason: 'area-weight-derivation-invalid',
        presentationStateProjection,
        entryIndex,
      };
    }
    if (relativeToMaximum.value !== '0' && !relativeToMaximum.value.startsWith('-')) {
      maximumPresentQuoteVolume = quoteVolume;
    }
  }

  const entries: HomeDashboardLiveCryptoBubbleAreaWeightProjectionEntry[] = [];
  for (let entryIndex = 0; entryIndex < presentationStateProjection.entries.length; entryIndex += 1) {
    const presentationEntry = presentationStateProjection.entries[entryIndex];
    if (presentationEntry.availability === 'missing') {
      entries.push({ presentationEntry, areaWeight: null });
      continue;
    }

    const quoteVolume = readPresentQuoteVolume(presentationEntry);
    if (quoteVolume === null || maximumPresentQuoteVolume === null) {
      return {
        ok: false,
        reason: 'area-weight-entry-inconsistent',
        presentationStateProjection,
        entryIndex,
      };
    }

    if (maximumPresentQuoteVolume === '0') {
      entries.push({ presentationEntry, areaWeight: '0' as DecimalString });
      continue;
    }

    const areaWeight = decimalDivide(quoteVolume, maximumPresentQuoteVolume);
    if (!areaWeight.ok) {
      return {
        ok: false,
        reason: 'area-weight-derivation-invalid',
        presentationStateProjection,
        entryIndex,
      };
    }
    entries.push({ presentationEntry, areaWeight: areaWeight.value });
  }

  return { ok: true, presentationStateProjection, entries };
}
