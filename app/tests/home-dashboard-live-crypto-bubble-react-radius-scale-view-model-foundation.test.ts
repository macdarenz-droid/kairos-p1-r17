import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import type {
  HomeDashboardLiveCryptoBubbleAreaWeightProjectionEntry,
  HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult,
} from '../src/application/dashboard/homeDashboardLiveCryptoBubbleAreaWeightProjection';
import type { HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel } from '../src/app/homeDashboardLiveCryptoBubbleReactAreaWeightViewModel';
import { projectHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel } from '../src/app/homeDashboardLiveCryptoBubbleReactRadiusScaleViewModel';

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

function successfulAreaProjection(
  entries: readonly HomeDashboardLiveCryptoBubbleAreaWeightProjectionEntry[],
): Extract<HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult, { ok: true }> {
  return {
    ok: true,
    presentationStateProjection: { ok: true } as never,
    entries,
  };
}

function areaWeightViewModel(
  areaWeightProjection: HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult | null,
  status: 'starting' | 'running' | 'acquisition-failed' = 'running',
): HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel {
  return {
    runtimeState: {
      status,
      latestObservation: null,
      lastError: status === 'acquisition-failed' ? new Error('later acquisition failed') : null,
    },
    areaWeightProjection,
  } as HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel;
}

describe('Home Dashboard Live Crypto Bubble React radius-scale view-model foundation', () => {
  it('preserves exact area-weight view-model and runtime-state references before radius evidence exists', () => {
    const input = areaWeightViewModel(null, 'starting');
    const result = projectHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel(input);

    expect(result.areaWeightViewModel).toBe(input);
    expect(result.runtimeState).toBe(input.runtimeState);
    expect(result.radiusScaleProjection).toBeNull();
  });

  it('delegates the exact successful area-weight projection once into released Gate364 radius-scale evidence', () => {
    const entries = [areaEntry('largest', d('1')), areaEntry('quarter', d('0.25')), areaEntry('missing', null)];
    const areaProjection = successfulAreaProjection(entries);
    const input = areaWeightViewModel(areaProjection);
    const result = projectHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel(input);

    expect(result.areaWeightViewModel).toBe(input);
    expect(result.runtimeState).toBe(input.runtimeState);
    expect(result.radiusScaleProjection?.ok).toBe(true);
    if (result.radiusScaleProjection?.ok !== true) return;
    expect(result.radiusScaleProjection.areaWeightProjection).toBe(areaProjection);
    expect(result.radiusScaleProjection.entries.map((entry) => entry.radiusScale)).toEqual([1, 0.5, null]);
    result.radiusScaleProjection.entries.forEach((entry, index) => {
      expect(entry.areaWeightEntry).toBe(entries[index]);
    });
  });

  it('preserves released area-weight failure evidence through Gate364 without fabricating radius output', () => {
    const failure = {
      ok: false,
      reason: 'presentation-state-projection-invalid',
      presentationStateProjection: { ok: false } as never,
    } as Extract<HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult, { ok: false }>;
    const input = areaWeightViewModel(failure);
    const result = projectHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel(input);

    expect(result.areaWeightViewModel).toBe(input);
    expect(result.runtimeState).toBe(input.runtimeState);
    expect(result.radiusScaleProjection).toEqual({
      ok: false,
      reason: 'area-weight-projection-invalid',
      areaWeightProjection: failure,
    });
    expect(result.radiusScaleProjection?.areaWeightProjection).toBe(failure);
  });

  it('keeps last authoritative radius evidence composable when runtime status reports a later acquisition failure', () => {
    const areaProjection = successfulAreaProjection([areaEntry('retained', d('0.81'))]);
    const input = areaWeightViewModel(areaProjection, 'acquisition-failed');
    const result = projectHomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel(input);

    expect(result.areaWeightViewModel).toBe(input);
    expect(result.runtimeState).toBe(input.runtimeState);
    expect(result.runtimeState.lastError).toBe(input.runtimeState.lastError);
    expect(result.radiusScaleProjection?.ok).toBe(true);
    if (result.radiusScaleProjection?.ok !== true) return;
    expect(result.radiusScaleProjection.entries[0].radiusScale).toBeCloseTo(0.9, 12);
  });
});
