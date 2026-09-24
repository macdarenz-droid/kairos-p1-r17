/**
 * Caller-owned CSS-pixel bounds for a future Live Crypto Bubble layout owner.
 * This contract validates only the supplied rectangular extent. It chooses no
 * measurement source, responsive rule or downstream presentation behavior.
 */
export interface HomeDashboardLiveCryptoBubbleLayoutBoundsPolicy {
  readonly widthCssPixels: number;
  readonly heightCssPixels: number;
}

export type HomeDashboardLiveCryptoBubbleLayoutBoundsPolicyValidationResult =
  | {
      readonly ok: true;
      readonly policy: HomeDashboardLiveCryptoBubbleLayoutBoundsPolicy;
    }
  | {
      readonly ok: false;
      readonly reason: 'width-invalid' | 'height-invalid';
    };

/**
 * Validate exact caller-owned bounds without measuring, normalizing or
 * substituting values. Zero is valid so collapsed/hidden layout disposition
 * remains the caller's responsibility rather than an invented minimum size.
 */
export function validateHomeDashboardLiveCryptoBubbleLayoutBoundsPolicy(
  policy: HomeDashboardLiveCryptoBubbleLayoutBoundsPolicy,
): HomeDashboardLiveCryptoBubbleLayoutBoundsPolicyValidationResult {
  if (!Number.isFinite(policy.widthCssPixels) || policy.widthCssPixels < 0) {
    return { ok: false, reason: 'width-invalid' };
  }

  if (!Number.isFinite(policy.heightCssPixels) || policy.heightCssPixels < 0) {
    return { ok: false, reason: 'height-invalid' };
  }

  return { ok: true, policy };
}
