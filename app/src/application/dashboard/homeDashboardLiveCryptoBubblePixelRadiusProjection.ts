import type {
  HomeDashboardLiveCryptoBubbleRadiusScaleProjectionEntry,
  HomeDashboardLiveCryptoBubbleRadiusScaleProjectionResult,
} from './homeDashboardLiveCryptoBubbleRadiusScaleProjection';
import {
  validateHomeDashboardLiveCryptoBubblePixelRadiusPolicy,
  type HomeDashboardLiveCryptoBubblePixelRadiusPolicy,
  type HomeDashboardLiveCryptoBubblePixelRadiusPolicyValidationResult,
} from './homeDashboardLiveCryptoBubblePixelRadiusPolicy';

type SuccessfulRadiusScaleProjection = Extract<
  HomeDashboardLiveCryptoBubbleRadiusScaleProjectionResult,
  { readonly ok: true }
>;

type FailedRadiusScaleProjection = Exclude<
  HomeDashboardLiveCryptoBubbleRadiusScaleProjectionResult,
  { readonly ok: true }
>;

type FailedPixelRadiusPolicyValidation = Exclude<
  HomeDashboardLiveCryptoBubblePixelRadiusPolicyValidationResult,
  { readonly ok: true }
>;

export interface HomeDashboardLiveCryptoBubblePixelRadiusProjectionEntry {
  readonly radiusScaleEntry: HomeDashboardLiveCryptoBubbleRadiusScaleProjectionEntry;
  readonly radiusCssPixels: number | null;
}

export type HomeDashboardLiveCryptoBubblePixelRadiusProjectionResult =
  | {
      readonly ok: true;
      readonly radiusScaleProjection: SuccessfulRadiusScaleProjection;
      readonly policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy;
      readonly entries: readonly HomeDashboardLiveCryptoBubblePixelRadiusProjectionEntry[];
    }
  | {
      readonly ok: false;
      readonly reason: 'radius-scale-projection-invalid';
      readonly radiusScaleProjection: FailedRadiusScaleProjection;
      readonly policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy;
    }
  | {
      readonly ok: false;
      readonly reason: 'pixel-radius-policy-invalid';
      readonly radiusScaleProjection: SuccessfulRadiusScaleProjection;
      readonly policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy;
      readonly policyValidation: FailedPixelRadiusPolicyValidation;
    }
  | {
      readonly ok: false;
      readonly reason: 'pixel-radius-entry-invalid';
      readonly radiusScaleProjection: SuccessfulRadiusScaleProjection;
      readonly policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy;
      readonly entryIndex: number;
    };

/**
 * Pure presentation-only conversion from released normalized radius evidence to
 * caller-bounded CSS-pixel radius. The caller owns the bounds; this projection
 * owns only deterministic interpolation inside those validated bounds.
 */
export function projectHomeDashboardLiveCryptoBubblePixelRadii(
  radiusScaleProjection: HomeDashboardLiveCryptoBubbleRadiusScaleProjectionResult,
  policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy,
): HomeDashboardLiveCryptoBubblePixelRadiusProjectionResult {
  if (!radiusScaleProjection.ok) {
    return {
      ok: false,
      reason: 'radius-scale-projection-invalid',
      radiusScaleProjection,
      policy,
    };
  }

  const policyValidation = validateHomeDashboardLiveCryptoBubblePixelRadiusPolicy(policy);
  if (!policyValidation.ok) {
    return {
      ok: false,
      reason: 'pixel-radius-policy-invalid',
      radiusScaleProjection,
      policy,
      policyValidation,
    };
  }

  const minimumRadiusCssPixels = policyValidation.policy.minimumRadiusCssPixels;
  const radiusRangeCssPixels =
    policyValidation.policy.maximumRadiusCssPixels - minimumRadiusCssPixels;

  const entries: HomeDashboardLiveCryptoBubblePixelRadiusProjectionEntry[] = [];
  for (let entryIndex = 0; entryIndex < radiusScaleProjection.entries.length; entryIndex += 1) {
    const radiusScaleEntry = radiusScaleProjection.entries[entryIndex];
    if (radiusScaleEntry.radiusScale === null) {
      entries.push({ radiusScaleEntry, radiusCssPixels: null });
      continue;
    }

    const radiusScale = radiusScaleEntry.radiusScale;
    if (!Number.isFinite(radiusScale) || radiusScale < 0 || radiusScale > 1) {
      return {
        ok: false,
        reason: 'pixel-radius-entry-invalid',
        radiusScaleProjection,
        policy,
        entryIndex,
      };
    }

    const radiusCssPixels = minimumRadiusCssPixels + radiusScale * radiusRangeCssPixels;
    if (!Number.isFinite(radiusCssPixels)) {
      return {
        ok: false,
        reason: 'pixel-radius-entry-invalid',
        radiusScaleProjection,
        policy,
        entryIndex,
      };
    }

    entries.push({ radiusScaleEntry, radiusCssPixels });
  }

  return {
    ok: true,
    radiusScaleProjection,
    policy,
    entries,
  };
}
