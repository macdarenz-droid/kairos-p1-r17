import type { MarketType } from '../trades';

export type MarketCalculationCapability =
  | 'gross-pnl'
  | 'initial-risk'
  | 'position-size'
  | 'leverage';

export interface MarketSpecificCalculationPolicy {
  readonly id: string;
  readonly marketTypes: readonly MarketType[];
  readonly capabilities: readonly MarketCalculationCapability[];
}

export type MarketSpecificCalculationPolicyResolution =
  | {
      readonly ok: true;
      readonly policy: MarketSpecificCalculationPolicy;
    }
  | {
      readonly ok: false;
      readonly reason: 'policy-unavailable' | 'ambiguous-policy';
    };

export function resolveMarketSpecificCalculationPolicy(
  marketType: MarketType,
  capability: MarketCalculationCapability,
  policies: readonly MarketSpecificCalculationPolicy[],
): MarketSpecificCalculationPolicyResolution {
  const matches = policies.filter(
    (policy) =>
      policy.marketTypes.includes(marketType) &&
      policy.capabilities.includes(capability),
  );

  if (matches.length === 0) {
    return { ok: false, reason: 'policy-unavailable' };
  }

  if (matches.length > 1) {
    return { ok: false, reason: 'ambiguous-policy' };
  }

  return {
    ok: true,
    policy: matches[0],
  };
}
