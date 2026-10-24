import { describe, expect, it } from 'vitest';
import type {
  HomeDashboardLiveCryptoBubblePixelRadiusPolicy,
} from '../src/application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusPolicy';
import type {
  HomeDashboardLiveCryptoBubbleRadiusScaleProjectionResult,
} from '../src/application/dashboard/homeDashboardLiveCryptoBubbleRadiusScaleProjection';
import type {
  HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel,
} from '../src/app/homeDashboardLiveCryptoBubbleReactRadiusScaleViewModel';
import {
  projectHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel,
} from '../src/app/homeDashboardLiveCryptoBubbleReactPixelRadiusViewModel';

const policy = (
  minimumRadiusCssPixels: number,
  maximumRadiusCssPixels: number,
): HomeDashboardLiveCryptoBubblePixelRadiusPolicy => ({
  minimumRadiusCssPixels,
  maximumRadiusCssPixels,
});

function radiusScaleViewModel(
  radiusScaleProjection: HomeDashboardLiveCryptoBubbleRadiusScaleProjectionResult | null,
  status: 'starting' | 'running' | 'acquisition-failed' = 'running',
): HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel {
  return {
    areaWeightViewModel: { marker: 'area-weight-view-model' } as never,
    runtimeState: {
      status,
      latestObservation: null,
      lastError: status === 'acquisition-failed' ? new Error('later acquisition failed') : null,
    },
    radiusScaleProjection,
  } as HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel;
}

function successfulRadiusScaleProjection(
  scales: readonly (number | null)[],
): Extract<HomeDashboardLiveCryptoBubbleRadiusScaleProjectionResult, { ok: true }> {
  return {
    ok: true,
    areaWeightProjection: { ok: true } as never,
    entries: scales.map((radiusScale, index) => ({
      areaWeightEntry: { marker: `entry-${index}` } as never,
      radiusScale,
    })),
  };
}

describe('Home Dashboard Live Crypto Bubble React pixel-radius view-model foundation', () => {
  it('preserves exact radius-scale view-model and runtime-state references before normalized radius evidence exists', () => {
    const input = radiusScaleViewModel(null, 'starting');
    const result = projectHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel(
      input,
      policy(40, 20),
    );

    expect(result.radiusScaleViewModel).toBe(input);
    expect(result.runtimeState).toBe(input.runtimeState);
    expect(result.pixelRadiusProjection).toBeNull();
  });

  it('delegates exact released normalized radius evidence and exact caller bounds once into Gate375 pixel-radius projection', () => {
    const radiusScaleProjection = successfulRadiusScaleProjection([0, 0.5, 1, null]);
    const input = radiusScaleViewModel(radiusScaleProjection);
    const bounds = policy(10, 50);
    const result = projectHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel(input, bounds);

    expect(result.radiusScaleViewModel).toBe(input);
    expect(result.runtimeState).toBe(input.runtimeState);
    expect(result.pixelRadiusProjection?.ok).toBe(true);
    if (result.pixelRadiusProjection?.ok !== true) return;
    expect(result.pixelRadiusProjection.radiusScaleProjection).toBe(radiusScaleProjection);
    expect(result.pixelRadiusProjection.policy).toBe(bounds);
    expect(result.pixelRadiusProjection.entries.map((entry) => entry.radiusCssPixels)).toEqual([
      10,
      30,
      50,
      null,
    ]);
  });

  it('preserves released radius-scale failure evidence by exact reference through Gate375 projection', () => {
    const failure = {
      ok: false,
      reason: 'area-weight-projection-invalid',
      areaWeightProjection: { ok: false } as never,
    } as Extract<HomeDashboardLiveCryptoBubbleRadiusScaleProjectionResult, { ok: false }>;
    const input = radiusScaleViewModel(failure);
    const bounds = policy(10, 50);
    const result = projectHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel(input, bounds);

    expect(result.radiusScaleViewModel).toBe(input);
    expect(result.runtimeState).toBe(input.runtimeState);
    expect(result.pixelRadiusProjection).toEqual({
      ok: false,
      reason: 'radius-scale-projection-invalid',
      radiusScaleProjection: failure,
      policy: bounds,
    });
    expect(result.pixelRadiusProjection?.radiusScaleProjection).toBe(failure);
  });

  it('delegates invalid caller bounds to Gate374 through Gate375 without inventing fallback values', () => {
    const radiusScaleProjection = successfulRadiusScaleProjection([0.5]);
    const input = radiusScaleViewModel(radiusScaleProjection);
    const bounds = policy(50, 10);
    const result = projectHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel(input, bounds);

    expect(result.pixelRadiusProjection).toEqual({
      ok: false,
      reason: 'pixel-radius-policy-invalid',
      radiusScaleProjection,
      policy: bounds,
      policyValidation: { ok: false, reason: 'radius-range-invalid' },
    });
  });

  it('keeps last authoritative pixel-radius evidence composable when runtime status reports a later acquisition failure', () => {
    const radiusScaleProjection = successfulRadiusScaleProjection([0.75]);
    const input = radiusScaleViewModel(radiusScaleProjection, 'acquisition-failed');
    const bounds = policy(10, 50);
    const result = projectHomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel(input, bounds);

    expect(result.runtimeState).toBe(input.runtimeState);
    expect(result.runtimeState.lastError).toBe(input.runtimeState.lastError);
    expect(result.pixelRadiusProjection?.ok).toBe(true);
    if (result.pixelRadiusProjection?.ok !== true) return;
    expect(result.pixelRadiusProjection.entries[0].radiusCssPixels).toBe(40);
  });
});
