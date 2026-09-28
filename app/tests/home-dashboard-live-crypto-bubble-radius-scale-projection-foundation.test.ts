import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import type {
  HomeDashboardLiveCryptoBubbleAreaWeightProjectionEntry,
  HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult,
} from '../src/application/dashboard/homeDashboardLiveCryptoBubbleAreaWeightProjection';
import { projectHomeDashboardLiveCryptoBubbleRadiusScales } from '../src/application/dashboard/homeDashboardLiveCryptoBubbleRadiusScaleProjection';

const d = (value: string) => value as DecimalString;

function areaEntry(
  marker: string,
  areaWeight: DecimalString | null,
): HomeDashboardLiveCryptoBubbleAreaWeightProjectionEntry {
  return {
    presentationEntry: { marker } as never,
    areaWeight,
  };
}

function success(
  entries: readonly HomeDashboardLiveCryptoBubbleAreaWeightProjectionEntry[],
): Extract<HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult, { ok: true }> {
  return {
    ok: true,
    presentationStateProjection: { ok: true } as never,
    entries,
  };
}

describe('Home Dashboard Live Crypto Bubble normalized radius-scale projection foundation', () => {
  it('derives the approved square-root radius scale while preserving exact entry references and order', () => {
    const entries = [
      areaEntry('largest', d('1')),
      areaEntry('quarter-area', d('0.25')),
      areaEntry('zero-area', d('0')),
      areaEntry('missing', null),
    ];
    const input = success(entries);

    const result = projectHomeDashboardLiveCryptoBubbleRadiusScales(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.areaWeightProjection).toBe(input);
    expect(result.entries.map((entry) => entry.radiusScale)).toEqual([1, 0.5, 0, null]);
    result.entries.forEach((entry, index) => {
      expect(entry.areaWeightEntry).toBe(entries[index]);
    });
  });

  it('does not sort or rerank when later entries have larger radius scales', () => {
    const entries = [
      areaEntry('small', d('0.04')),
      areaEntry('largest', d('1')),
      areaEntry('large', d('0.81')),
    ];
    const result = projectHomeDashboardLiveCryptoBubbleRadiusScales(success(entries));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((entry) => entry.radiusScale)).toEqual([0.2, 1, 0.9]);
    expect(result.entries.map((entry) => entry.areaWeightEntry)).toEqual(entries);
  });

  it('preserves an upstream area-weight projection failure by exact reference', () => {
    const failure = {
      ok: false,
      reason: 'presentation-state-projection-invalid',
      presentationStateProjection: { ok: false } as never,
    } as Extract<HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult, { ok: false }>;

    const result = projectHomeDashboardLiveCryptoBubbleRadiusScales(failure);

    expect(result).toEqual({
      ok: false,
      reason: 'area-weight-projection-invalid',
      areaWeightProjection: failure,
    });
    expect(result.areaWeightProjection).toBe(failure);
  });

  it.each([
    ['negative', '-0.01'],
    ['greater-than-one', '1.01'],
    ['not-a-number', 'NaN'],
    ['positive-infinity', 'Infinity'],
  ])('fails closed for %s successful area-weight evidence', (_label, invalidValue) => {
    const valid = areaEntry('valid', d('0.25'));
    const invalid = areaEntry('invalid', invalidValue as DecimalString);
    const input = success([valid, invalid]);

    const result = projectHomeDashboardLiveCryptoBubbleRadiusScales(input);

    expect(result).toEqual({
      ok: false,
      reason: 'radius-scale-entry-invalid',
      areaWeightProjection: input,
      entryIndex: 1,
    });
  });
});
