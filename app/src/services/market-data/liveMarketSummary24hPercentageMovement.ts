import {
  calculatePercentage,
  decimalSubtract,
} from '../../domain/calculations';
import type { DecimalString } from '../../domain/trades';
import { validateLiveMarketSummaryFact } from './liveMarketSummaryFactSemantics';
import type {
  LiveMarketSummaryFact,
  MarketDataInstrument,
} from './marketDataTypes';

export interface LiveMarketSummary24hPercentageMovement {
  readonly instrument: MarketDataInstrument;
  readonly fact: LiveMarketSummaryFact;
  readonly movementPercent24h: DecimalString;
}

export type LiveMarketSummary24hPercentageMovementResult =
  | {
      readonly ok: true;
      readonly movement: LiveMarketSummary24hPercentageMovement;
    }
  | {
      readonly ok: false;
      readonly reason: 'fact-invalid' | 'movement-calculation-invalid';
    };

/**
 * Provider-neutral 24h percentage movement derivation over one canonical
 * LiveMarketSummaryFact. Existing fact validation remains authoritative and all
 * arithmetic delegates to released Decimal calculation owners.
 */
export function deriveLiveMarketSummary24hPercentageMovement(
  fact: LiveMarketSummaryFact,
): LiveMarketSummary24hPercentageMovementResult {
  const validation = validateLiveMarketSummaryFact(fact);
  if (!validation.ok) {
    return { ok: false, reason: 'fact-invalid' };
  }

  const change = decimalSubtract(validation.fact.lastPrice, validation.fact.open24h);
  if (!change.ok) {
    return { ok: false, reason: 'movement-calculation-invalid' };
  }

  const percentage = calculatePercentage(change.value, validation.fact.open24h);
  if (!percentage.ok) {
    return { ok: false, reason: 'movement-calculation-invalid' };
  }

  return {
    ok: true,
    movement: {
      instrument: validation.fact.instrument,
      fact: validation.fact,
      movementPercent24h: percentage.value,
    },
  };
}
