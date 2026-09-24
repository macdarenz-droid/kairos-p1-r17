import type { ManualExecutionRow } from './manualTradeExecutionDraft';

/** The three numbers quick log asks for; strings pass through untouched and only the save command validates them. */
export interface QuickTradeLogDraft {
  readonly entryPrice: string;
  readonly exitPrice: string;
  readonly quantity: string;
}

export function createEmptyQuickTradeLogDraft(): QuickTradeLogDraft {
  return { entryPrice: '', exitPrice: '', quantity: '' };
}

/**
 * Quick log maps to exactly what the full form would save for a closed trade:
 * one entry at the opened time and one exit at the closed time, same quantity.
 * It computes no number; results come from the existing calculation owners.
 */
export function quickTradeLogRows(quick: QuickTradeLogDraft, openedAt: string, closedAt: string): readonly ManualExecutionRow[] {
  return [
    { key: 'quick-entry', type: 'entry', price: quick.entryPrice, quantity: quick.quantity, executedAt: openedAt },
    { key: 'quick-exit', type: 'exit', price: quick.exitPrice, quantity: quick.quantity, executedAt: closedAt },
  ];
}

export type QuickTradeLogField = 'entryPrice' | 'exitPrice' | 'quantity' | 'openedAt' | 'closedAt';

const FIELD_FOR: Readonly<Record<string, QuickTradeLogField>> = {
  'executions.0.price': 'entryPrice',
  'executions.1.price': 'exitPrice',
  'executions.0.quantity': 'quantity',
  'executions.1.quantity': 'quantity',
  'executions.0.executedAt': 'openedAt',
  'executions.1.executedAt': 'closedAt',
};

/** Which quick log control a save or prepare error points at, or null when it is not a quick log field. */
export function quickTradeLogFieldFor(field: string | undefined): QuickTradeLogField | null {
  return field !== undefined && Object.hasOwn(FIELD_FOR, field) ? FIELD_FOR[field] : null;
}
