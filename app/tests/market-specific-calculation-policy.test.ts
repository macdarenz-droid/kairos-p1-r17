import { describe, expect, it } from 'vitest';
import type {
  MarketSpecificCalculationPolicy,
} from '../src/domain/calculations';
import {
  resolveMarketSpecificCalculationPolicy,
} from '../src/domain/calculations';

const spotPolicy: MarketSpecificCalculationPolicy = {
  id: 'spot-policy',
  marketTypes: ['stock', 'crypto'],
  capabilities: ['gross-pnl', 'initial-risk'],
};

const futuresPolicy: MarketSpecificCalculationPolicy = {
  id: 'futures-policy',
  marketTypes: ['futures'],
  capabilities: ['gross-pnl'],
};

describe('P11.9 market-specific calculation policy boundary', () => {
  it('resolves an explicit matching policy', () => {
    expect(resolveMarketSpecificCalculationPolicy(
      'stock',
      'gross-pnl',
      [spotPolicy, futuresPolicy],
    )).toEqual({
      ok: true,
      policy: spotPolicy,
    });
  });

  it('never falls back to a different market policy', () => {
    expect(resolveMarketSpecificCalculationPolicy(
      'forex',
      'gross-pnl',
      [spotPolicy, futuresPolicy],
    )).toEqual({
      ok: false,
      reason: 'policy-unavailable',
    });
  });

  it('requires the requested capability to be explicit', () => {
    expect(resolveMarketSpecificCalculationPolicy(
      'futures',
      'initial-risk',
      [futuresPolicy],
    )).toEqual({
      ok: false,
      reason: 'policy-unavailable',
    });
  });

  it('rejects ambiguous ownership instead of choosing by order', () => {
    const duplicate: MarketSpecificCalculationPolicy = {
      id: 'other-stock-policy',
      marketTypes: ['stock'],
      capabilities: ['gross-pnl'],
    };

    expect(resolveMarketSpecificCalculationPolicy(
      'stock',
      'gross-pnl',
      [spotPolicy, duplicate],
    )).toEqual({
      ok: false,
      reason: 'ambiguous-policy',
    });
  });

  it('does not mutate the policy collection while resolving', () => {
    const policies = [spotPolicy, futuresPolicy] as const;
    const snapshot = JSON.stringify(policies);

    resolveMarketSpecificCalculationPolicy(
      'crypto',
      'initial-risk',
      policies,
    );

    expect(JSON.stringify(policies)).toBe(snapshot);
  });
});
