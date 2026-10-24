import { describe, expect, it } from 'vitest';
import { projectDisciplineScore, projectDisciplineTrend, type DisciplineScoreMonth } from '../src/application/discipline/disciplineScore';
import type { DisciplineMistakeMark, TradeDisciplineId, TradeDisciplineRecord } from '../src/domain/discipline';
import type { TradeId } from '../src/domain/trades';

const mark = (itemId: string, label: string): DisciplineMistakeMark => ({ itemId, label });
function record(tradeId: string, reviewed: boolean, mistakes: DisciplineMistakeMark[], at: string): TradeDisciplineRecord {
  return {
    id: `d-${tradeId}` as TradeDisciplineId, tradeId: tradeId as TradeId, preTradeChecklist: [], postTradeReview: [], mistakes, note: '',
    checklistCompletedAt: null, reviewedAt: reviewed ? at : null, createdAt: at, updatedAt: at,
  };
}

// Each month: its closed trades, each with its review (or none). Reviews only, so the score is the share reviewed.
const plan: Record<string, [string, boolean, DisciplineMistakeMark[]][]> = {
  '2025-11': [['X1', true, [mark('revenge', 'Revenge trade')]], ['X2', true, [mark('revenge', 'Revenge trade')]], ['X3', true, [mark('revenge', 'Revenge trade')]]],
  '2025-12': [], '2026-01': [], '2026-02': [], '2026-03': [], '2026-04': [],
  '2026-05': [['A', true, [mark('moved-stop', 'Moved stop')]]],
  '2026-06': [],
  '2026-07': [['B', false, []]],
  '2026-08': [['C', true, []]],
  '2026-09': [['D', true, [mark('moved-stop', 'Moved my stop'), mark('early-exit', 'Closed too early')]]],
  '2026-10': [['E', true, [mark('moved-stop', 'Moved my stop'), mark('late-entry', 'Late entry')]], ['F', true, [mark('late-entry', 'Late entry')]]],
};
const months: DisciplineScoreMonth[] = Object.entries(plan).map(([monthKey, trades]) => ({
  monthKey,
  score: projectDisciplineScore({
    closedTradeIds: trades.map(([id]) => id),
    records: new Map(trades.map(([id, reviewed, mistakes]) => [id, record(id, reviewed, mistakes, `${monthKey}-15T10:00:00.000Z`)])),
  }),
}));

describe('T-058e the discipline score month by month', () => {
  it('leaves a gap for a month with no closed trade, and keeps a real 0 for a month with trades and no review', () => {
    const trend = projectDisciplineTrend({ months, window: 6 });
    expect(trend.scores).toEqual([
      { monthKey: '2026-05', score: 100 }, { monthKey: '2026-06', score: null }, { monthKey: '2026-07', score: 0 },
      { monthKey: '2026-08', score: 100 }, { monthKey: '2026-09', score: 100 }, { monthKey: '2026-10', score: 100 },
    ]);
  });

  it('counts each common mistake per month: 0 when the month has reviews without it, nothing when it has no review', () => {
    const [movedStop] = projectDisciplineTrend({ months, window: 6 }).mistakes;
    expect(movedStop).toEqual({
      itemId: 'moved-stop', label: 'Moved my stop', total: 3,
      counts: [
        { monthKey: '2026-05', count: 1 }, { monthKey: '2026-06', count: null }, { monthKey: '2026-07', count: null },
        { monthKey: '2026-08', count: 0 }, { monthKey: '2026-09', count: 1 }, { monthKey: '2026-10', count: 1 },
      ],
    });
  });

  it('picks the common mistakes over the months shown, with the newest label', () => {
    const six = projectDisciplineTrend({ months, window: 6 }).mistakes.map(({ label, total }) => [label, total]);
    const twelve = projectDisciplineTrend({ months, window: 12 }).mistakes.map(({ label, total }) => [label, total]);
    expect(six).toEqual([['Moved my stop', 3], ['Late entry', 2], ['Closed too early', 1]]);
    expect(twelve).toEqual([['Moved my stop', 3], ['Revenge trade', 3], ['Late entry', 2]]);
    expect(projectDisciplineTrend({ months, window: 12 }).scores).toHaveLength(12);
  });

  it('has no mistakes when nothing was tagged', () => {
    expect(projectDisciplineTrend({ months: months.slice(7, 10), window: 6 }).mistakes).toEqual([]);
  });
});
