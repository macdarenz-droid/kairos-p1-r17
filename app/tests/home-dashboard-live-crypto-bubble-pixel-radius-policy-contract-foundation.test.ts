import { describe, expect, it } from 'vitest';
import {
  validateHomeDashboardLiveCryptoBubblePixelRadiusPolicy,
  type HomeDashboardLiveCryptoBubblePixelRadiusPolicy,
} from '../src/application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusPolicy';

describe('Home Dashboard Live Crypto Bubble caller-owned pixel-radius policy contract foundation', () => {
  it('accepts finite non-negative caller-owned bounds and preserves the exact policy reference', () => {
    const policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy = {
      minimumRadiusCssPixels: 0,
      maximumRadiusCssPixels: 64,
    };

    const result = validateHomeDashboardLiveCryptoBubblePixelRadiusPolicy(policy);

    expect(result).toEqual({ ok: true, policy });
    if (!result.ok) return;
    expect(result.policy).toBe(policy);
  });

  it('accepts equal bounds without inventing a requirement that bubble size must vary', () => {
    const policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy = {
      minimumRadiusCssPixels: 24,
      maximumRadiusCssPixels: 24,
    };

    expect(validateHomeDashboardLiveCryptoBubblePixelRadiusPolicy(policy)).toEqual({
      ok: true,
      policy,
    });
  });

  it.each([
    ['negative minimum', { minimumRadiusCssPixels: -1, maximumRadiusCssPixels: 10 }, 'minimum-radius-invalid'],
    ['NaN minimum', { minimumRadiusCssPixels: Number.NaN, maximumRadiusCssPixels: 10 }, 'minimum-radius-invalid'],
    ['infinite minimum', { minimumRadiusCssPixels: Number.POSITIVE_INFINITY, maximumRadiusCssPixels: 10 }, 'minimum-radius-invalid'],
    ['negative maximum', { minimumRadiusCssPixels: 0, maximumRadiusCssPixels: -1 }, 'maximum-radius-invalid'],
    ['NaN maximum', { minimumRadiusCssPixels: 0, maximumRadiusCssPixels: Number.NaN }, 'maximum-radius-invalid'],
    ['infinite maximum', { minimumRadiusCssPixels: 0, maximumRadiusCssPixels: Number.POSITIVE_INFINITY }, 'maximum-radius-invalid'],
  ] as const)('rejects %s without substituting fallback values', (_label, policy, reason) => {
    expect(validateHomeDashboardLiveCryptoBubblePixelRadiusPolicy(policy)).toEqual({
      ok: false,
      reason,
    });
  });

  it('rejects a maximum below the minimum without reordering caller-owned values', () => {
    const policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy = {
      minimumRadiusCssPixels: 40,
      maximumRadiusCssPixels: 20,
    };

    expect(validateHomeDashboardLiveCryptoBubblePixelRadiusPolicy(policy)).toEqual({
      ok: false,
      reason: 'radius-range-invalid',
    });
  });
});
