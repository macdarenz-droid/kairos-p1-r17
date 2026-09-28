import { describe, expect, it } from 'vitest';
import {
  validateHomeDashboardLiveCryptoBubbleLayoutBoundsPolicy,
  type HomeDashboardLiveCryptoBubbleLayoutBoundsPolicy,
} from '../src/application/dashboard/homeDashboardLiveCryptoBubbleLayoutBoundsPolicy';

describe('Home Dashboard Live Crypto Bubble caller-owned layout-bounds policy contract foundation', () => {
  it('accepts finite non-negative caller-owned bounds and preserves the exact policy reference', () => {
    const policy: HomeDashboardLiveCryptoBubbleLayoutBoundsPolicy = {
      widthCssPixels: 320,
      heightCssPixels: 480,
    };

    const result = validateHomeDashboardLiveCryptoBubbleLayoutBoundsPolicy(policy);

    expect(result).toEqual({ ok: true, policy });
    if (!result.ok) return;
    expect(result.policy).toBe(policy);
  });

  it('accepts zero bounds without inventing minimum viewport or visibility semantics', () => {
    const policy: HomeDashboardLiveCryptoBubbleLayoutBoundsPolicy = {
      widthCssPixels: 0,
      heightCssPixels: 0,
    };

    expect(validateHomeDashboardLiveCryptoBubbleLayoutBoundsPolicy(policy)).toEqual({
      ok: true,
      policy,
    });
  });

  it.each([
    ['negative width', { widthCssPixels: -1, heightCssPixels: 100 }, 'width-invalid'],
    ['NaN width', { widthCssPixels: Number.NaN, heightCssPixels: 100 }, 'width-invalid'],
    ['infinite width', { widthCssPixels: Number.POSITIVE_INFINITY, heightCssPixels: 100 }, 'width-invalid'],
    ['negative height', { widthCssPixels: 100, heightCssPixels: -1 }, 'height-invalid'],
    ['NaN height', { widthCssPixels: 100, heightCssPixels: Number.NaN }, 'height-invalid'],
    ['infinite height', { widthCssPixels: 100, heightCssPixels: Number.POSITIVE_INFINITY }, 'height-invalid'],
  ] as const)('rejects %s without substituting fallback values', (_label, policy, reason) => {
    expect(validateHomeDashboardLiveCryptoBubbleLayoutBoundsPolicy(policy)).toEqual({
      ok: false,
      reason,
    });
  });
});
