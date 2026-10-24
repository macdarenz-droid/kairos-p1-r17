/**
 * Caller-owned concrete pixel-radius policy for future Live Crypto Bubble rendering.
 * This boundary validates only the supplied radius bounds. It owns no default values,
 * normalized-radius arithmetic, viewport logic, layout, renderer or market truth.
 */
export interface HomeDashboardLiveCryptoBubblePixelRadiusPolicy {
  readonly minimumRadiusCssPixels: number;
  readonly maximumRadiusCssPixels: number;
}

export type HomeDashboardLiveCryptoBubblePixelRadiusPolicyValidationResult =
  | {
      readonly ok: true;
      readonly policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy;
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'minimum-radius-invalid'
        | 'maximum-radius-invalid'
        | 'radius-range-invalid';
    };

/**
 * Validate one caller-owned radius policy without selecting or normalizing values.
 * Equal bounds are valid because whether Bubble size varies is caller policy.
 */
export function validateHomeDashboardLiveCryptoBubblePixelRadiusPolicy(
  policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy,
): HomeDashboardLiveCryptoBubblePixelRadiusPolicyValidationResult {
  if (!Number.isFinite(policy.minimumRadiusCssPixels) || policy.minimumRadiusCssPixels < 0) {
    return { ok: false, reason: 'minimum-radius-invalid' };
  }

  if (!Number.isFinite(policy.maximumRadiusCssPixels) || policy.maximumRadiusCssPixels < 0) {
    return { ok: false, reason: 'maximum-radius-invalid' };
  }

  if (policy.maximumRadiusCssPixels < policy.minimumRadiusCssPixels) {
    return { ok: false, reason: 'radius-range-invalid' };
  }

  return { ok: true, policy };
}
