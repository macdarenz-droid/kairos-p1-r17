import type { TradeDisciplineRecord } from '../../domain/discipline';

export interface TradeChecklistSummary {
  readonly ticked: number;
  readonly asked: number;
  readonly complete: boolean;
}

/**
 * P22.3 the one owner of one trade's checklist counts: steps ticked, steps
 * asked, and whether every step was ticked. null: no checklist saved for this trade.
 */
export function summarizeTradeChecklist(record: TradeDisciplineRecord | null): TradeChecklistSummary | null {
  if (record === null || record.checklistCompletedAt === null || record.preTradeChecklist.length === 0) return null;
  const asked = record.preTradeChecklist.length;
  const ticked = record.preTradeChecklist.filter((answer) => answer.answer === 'yes').length;
  return Object.freeze({ ticked, asked, complete: ticked === asked });
}
