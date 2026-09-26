import type { ManualTradeExecutionInput, ManualTradeFeeInput, SaveManualTradeInput } from './saveManualTrade';

export interface ManualExecutionRow extends ManualTradeExecutionInput { readonly key: string; }
export interface ManualFeeRow extends ManualTradeFeeInput { readonly key: string; }

type PreparedExecutionDetails =
  | { readonly ok: true; readonly input: SaveManualTradeInput }
  | { readonly ok: false; readonly type: 'execution-draft-invalid'; readonly field: string; readonly message: string };

/** Adapt explicit form facts only. P10's save command retains numeric validation
 * and the atomic write; P11 retains all financial calculation. */
export function prepareManualTradeExecutionDetails(
  input: SaveManualTradeInput,
  executions: readonly ManualExecutionRow[],
  fees: readonly ManualFeeRow[],
): PreparedExecutionDetails {
  if (executions.length && input.status !== 'open' && input.status !== 'closed') {
    return { ok: false, type: 'execution-draft-invalid', field: 'trade', message: 'Choose Open or Closed for actual entries and exits, or remove those rows.' };
  }
  const timestamp = (value: string | null | undefined): string | null => {
    if (!value?.trim()) return null;
    const date = new Date(value.trim());
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  };
  const rows: ManualTradeExecutionInput[] = [];
  for (const [index, row] of executions.entries()) {
    const executedAt = timestamp(row.executedAt);
    if (!executedAt) return { ok: false, type: 'execution-draft-invalid', field: `executions.${index}.executedAt`, message: `Add a valid date and time for ${row.type} ${index + 1}.` };
    rows.push({ type: row.type, price: row.price, quantity: row.quantity, executedAt });
  }
  return { ok: true, input: {
    ...input,
    openedAt: timestamp(input.openedAt), closedAt: timestamp(input.closedAt),
    ...(rows.length ? { executions: rows } : {}),
    ...(fees.length ? { fees: fees.map(({ amount, currency }) => ({ amount, currency })) } : {}),
  } };
}
