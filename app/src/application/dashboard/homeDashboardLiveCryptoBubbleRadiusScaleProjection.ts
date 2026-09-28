import type {
  HomeDashboardLiveCryptoBubbleAreaWeightProjectionEntry,
  HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult,
} from './homeDashboardLiveCryptoBubbleAreaWeightProjection';

type SuccessfulAreaWeightProjection = Extract<
  HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult,
  { readonly ok: true }
>;

type FailedAreaWeightProjection = Exclude<
  HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult,
  { readonly ok: true }
>;

export interface HomeDashboardLiveCryptoBubbleRadiusScaleProjectionEntry {
  readonly areaWeightEntry: HomeDashboardLiveCryptoBubbleAreaWeightProjectionEntry;
  readonly radiusScale: number | null;
}

export type HomeDashboardLiveCryptoBubbleRadiusScaleProjectionResult =
  | {
      readonly ok: true;
      readonly areaWeightProjection: SuccessfulAreaWeightProjection;
      readonly entries: readonly HomeDashboardLiveCryptoBubbleRadiusScaleProjectionEntry[];
    }
  | {
      readonly ok: false;
      readonly reason: 'area-weight-projection-invalid';
      readonly areaWeightProjection: FailedAreaWeightProjection;
    }
  | {
      readonly ok: false;
      readonly reason: 'radius-scale-entry-invalid';
      readonly areaWeightProjection: SuccessfulAreaWeightProjection;
      readonly entryIndex: number;
    };

/**
 * Presentation-only normalized radius preparation.
 *
 * Gate352 owns exact normalized visual-area evidence. This boundary performs
 * only the user-approved area-to-radius transform: radius scale is the square
 * root of area weight. Pixel bounds, layout, theme, React and market truth
 * remain separately owned.
 */
export function projectHomeDashboardLiveCryptoBubbleRadiusScales(
  areaWeightProjection: HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult,
): HomeDashboardLiveCryptoBubbleRadiusScaleProjectionResult {
  if (!areaWeightProjection.ok) {
    return {
      ok: false,
      reason: 'area-weight-projection-invalid',
      areaWeightProjection,
    };
  }

  const entries: HomeDashboardLiveCryptoBubbleRadiusScaleProjectionEntry[] = [];
  for (let entryIndex = 0; entryIndex < areaWeightProjection.entries.length; entryIndex += 1) {
    const areaWeightEntry = areaWeightProjection.entries[entryIndex];
    if (areaWeightEntry.areaWeight === null) {
      entries.push({ areaWeightEntry, radiusScale: null });
      continue;
    }

    const areaWeightNumber = Number(areaWeightEntry.areaWeight);
    if (!Number.isFinite(areaWeightNumber) || areaWeightNumber < 0 || areaWeightNumber > 1) {
      return {
        ok: false,
        reason: 'radius-scale-entry-invalid',
        areaWeightProjection,
        entryIndex,
      };
    }

    const radiusScale = Math.sqrt(areaWeightNumber);
    if (!Number.isFinite(radiusScale)) {
      return {
        ok: false,
        reason: 'radius-scale-entry-invalid',
        areaWeightProjection,
        entryIndex,
      };
    }

    entries.push({ areaWeightEntry, radiusScale });
  }

  return { ok: true, areaWeightProjection, entries };
}
