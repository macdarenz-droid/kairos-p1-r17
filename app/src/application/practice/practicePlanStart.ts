/**
 * P26: the plan a practice trade starts from when it comes from the calculator. The one place that writes and reads the `/practice` address. It carries only the direction and the plan, never an entry or an exit; the numbers are the position-size owner's, exactly as it holds them.
 */

import { decimalCompare } from '../../domain/calculations/decimalKernel';
import { parsePositiveDecimalString, type DecimalString } from '../../domain/trades';
import { createEmptyManualTradeDraft, type ManualTradeDraft } from '../trades/manualTradeDraft';

export interface PracticePlanStart { readonly side: 'long' | 'short'; readonly entryPrice: DecimalString; readonly stopPrice: DecimalString; readonly quantity: DecimalString }
export const PRACTICE_PLAN_VALUE_MAX_LENGTH = 30;

/** The Practice address that opens the form with this plan. */
export function practicePlanHref(plan: PracticePlanStart): string {
  return `/practice?${new URLSearchParams({ side: plan.side, entry: plan.entryPrice, stop: plan.stopPrice, quantity: plan.quantity })}`;
}

function positive(value: string | null): DecimalString | null {
  if (value === null || value.length > PRACTICE_PLAN_VALUE_MAX_LENGTH) return null;
  const parsed = parsePositiveDecimalString(value);
  return parsed.ok ? parsed.value : null;
}

/** The plan in the address, or null when any rule fails. The address is data, never code; other keys are ignored. */
export function readPracticePlanStart(params: URLSearchParams): PracticePlanStart | null {
  const side = params.get('side');
  if (side !== 'long' && side !== 'short') return null;
  const entryPrice = positive(params.get('entry'));
  const stopPrice = positive(params.get('stop'));
  const quantity = positive(params.get('quantity'));
  if (entryPrice === null || stopPrice === null || quantity === null) return null;
  if (decimalCompare(stopPrice, entryPrice) !== (side === 'long' ? -1 : 1)) return null;
  return Object.freeze({ side, entryPrice, stopPrice, quantity });
}

/** The form draft a plan starts: the direction and the plan only; no entry, exit, symbol or currency. */
export function practicePlanDraft(plan: PracticePlanStart): ManualTradeDraft {
  return {
    ...createEmptyManualTradeDraft(),
    side: plan.side,
    plan: { plannedEntryPrice: plan.entryPrice, plannedStopPrice: plan.stopPrice, plannedTargetPrice: '', plannedQuantity: plan.quantity },
  };
}
