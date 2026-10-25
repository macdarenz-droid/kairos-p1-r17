import { describe, expect, it } from 'vitest';
import type {
  HomeDashboardLiveCryptoBubbleRadiusScaleProjectionEntry,
  HomeDashboardLiveCryptoBubbleRadiusScaleProjectionResult,
} from '../src/application/dashboard/homeDashboardLiveCryptoBubbleRadiusScaleProjection';
import {
  projectHomeDashboardLiveCryptoBubblePixelRadii,
} from '../src/application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusProjection';
import type {
  HomeDashboardLiveCryptoBubblePixelRadiusPolicy,
} from '../src/application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusPolicy';

function radiusEntry(
  marker: string,
  radiusScale: number | null,
): HomeDashboardLiveCryptoBubbleRadiusScaleProjectionEntry {
  return {
    areaWeightEntry: { marker } as never,
    radiusScale,
  };
}

function success(
  entries: readonly HomeDashboardLiveCryptoBubbleRadiusScaleProjectionEntry[],
): Extract<HomeDashboardLiveCryptoBubbleRadiusScaleProjectionResult, { ok: true }> {
  return {
    ok: true,
    areaWeightProjection: { ok: true } as never,
    entries,
  };
}

const policy = (
  minimumRadiusCssPixels: number,
  maximumRadiusCssPixels: number,
): HomeDashboardLiveCryptoBubblePixelRadiusPolicy => ({
  minimumRadiusCssPixels,
  maximumRadiusCssPixels,
});

describe('Home Dashboard Live Crypto Bubble pixel-radius projection foundation', () => {
  it('interpolates normalized radius evidence only inside exact caller-supplied bounds while preserving references and order', () => {
    const entries = [
      radiusEntry('minimum', 0),
      radiusEntry('quarter', 0.25),
      radiusEntry('half', 0.5),
      radiusEntry('maximum', 1),
      radiusEntry('missing', null),
    ];
    const input = success(entries);
    const bounds = policy(10, 50);

    const result = projectHomeDashboardLiveCryptoBubblePixelRadii(input, bounds);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.radiusScaleProjection).toBe(input);
    expect(result.policy).toBe(bounds);
    expect(result.entries.map((entry) => entry.radiusCssPixels)).toEqual([10, 20, 30, 50, null]);
    result.entries.forEach((entry, index) => {
      expect(entry.radiusScaleEntry).toBe(entries[index]);
    });
  });

  it('preserves caller choice of equal bounds without inventing visible size variation', () => {
    const entries = [radiusEntry('small', 0), radiusEntry('large', 1)];
    const result = projectHomeDashboardLiveCryptoBubblePixelRadii(success(entries), policy(24, 24));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((entry) => entry.radiusCssPixels)).toEqual([24, 24]);
  });

  it('preserves an upstream radius-scale projection failure by exact reference before policy interpretation', () => {
    const failure = {
      ok: false,
      reason: 'area-weight-projection-invalid',
      areaWeightProjection: { ok: false } as never,
    } as Extract<HomeDashboardLiveCryptoBubbleRadiusScaleProjectionResult, { ok: false }>;
    const bounds = policy(10, 50);

    const result = projectHomeDashboardLiveCryptoBubblePixelRadii(failure, bounds);

    expect(result).toEqual({
      ok: false,
      reason: 'radius-scale-projection-invalid',
      radiusScaleProjection: failure,
      policy: bounds,
    });
    expect(result.radiusScaleProjection).toBe(failure);
  });

  it('delegates invalid caller bounds to the released Gate374 policy validator without fallback values', () => {
    const input = success([radiusEntry('one', 0.5)]);
    const bounds = policy(40, 20);

    const result = projectHomeDashboardLiveCryptoBubblePixelRadii(input, bounds);

    expect(result).toEqual({
      ok: false,
      reason: 'pixel-radius-policy-invalid',
      radiusScaleProjection: input,
      policy: bounds,
      policyValidation: { ok: false, reason: 'radius-range-invalid' },
    });
  });

  it.each([
    ['negative', -0.01],
    ['greater-than-one', 1.01],
    ['not-a-number', Number.NaN],
    ['positive-infinity', Number.POSITIVE_INFINITY],
  ])('fails closed for %s radius-scale evidence instead of clamping it', (_label, invalidScale) => {
    const valid = radiusEntry('valid', 0.5);
    const invalid = radiusEntry('invalid', invalidScale);
    const input = success([valid, invalid]);
    const bounds = policy(10, 50);

    const result = projectHomeDashboardLiveCryptoBubblePixelRadii(input, bounds);

    expect(result).toEqual({
      ok: false,
      reason: 'pixel-radius-entry-invalid',
      radiusScaleProjection: input,
      policy: bounds,
      entryIndex: 1,
    });
  });
});
