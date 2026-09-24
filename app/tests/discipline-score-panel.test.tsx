import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { projectDisciplineScore } from '../src/application/discipline';
import type { TradeDisciplineId, TradeDisciplineRecord } from '../src/domain/discipline';
import type { TradeId } from '../src/domain/trades';
import { DisciplineScorePanel } from '../src/features/discipline/DisciplineScorePanel';

afterEach(cleanup);

const at = '2026-09-10T10:00:00.000Z';
function record(tradeId: string, checklist: [number, number] | null, mistakes: { itemId: string; label: string }[] = [], reviewed = true): TradeDisciplineRecord {
  return {
    id: `d-${tradeId}` as TradeDisciplineId, tradeId: tradeId as TradeId,
    preTradeChecklist: checklist ? Array.from({ length: checklist[1] }, (_, index) => ({ itemId: `s-${index}`, label: `Step ${index}`, answer: index < checklist[0] ? 'yes' as const : 'no' as const })) : [],
    postTradeReview: [], mistakes, note: '', checklistCompletedAt: checklist ? at : null, reviewedAt: reviewed ? at : null, createdAt: at, updatedAt: at,
  };
}
const ready = (closedTradeIds: string[], ...records: TradeDisciplineRecord[]) => ({ kind: 'ready' as const, score: projectDisciplineScore({ closedTradeIds, records: new Map(records.map(item => [item.tradeId as string, item])) }) });
const text = (value: string) => expect(screen.getByText(value)).toBeTruthy();

describe('T-033b discipline score panel', () => {
  it('shows the ring, both parts, the mistakes and the notice, with no list items', () => {
    render(<DisciplineScorePanel periodLabel="September 2026" state={ready(['A', 'B', 'C'],
      record('A', [5, 5], [{ itemId: 'moved-stop', label: 'Moved my stop' }]),
      record('B', [3, 5], [{ itemId: 'moved-stop', label: 'Moved my stop' }, { itemId: 'early-exit', label: 'Closed too early' }]))} />);
    expect(screen.getByRole('img', { name: 'Discipline score: 73 out of 100' })).toBeTruthy();
    text('Trades closed in September 2026');
    text('Before you trade: you ticked 8 of 10 steps (80%).');
    text('You did every step on 1 of 2 trades.');
    text('After the trade: you reviewed 2 of 3 closed trades (67%).');
    text('Most common mistakes: Moved my stop (2) · Closed too early (1)');
    text('Only your checklist and reviews count. Profit, the number of trades and streaks never change this score.');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(document.querySelectorAll('.kairos-discipline-bar')).toHaveLength(2);
  });

  it('says when the score uses reviews only', () => {
    render(<DisciplineScorePanel periodLabel="September 2026" state={ready(['A', 'B'], record('A', null))} />);
    text('Before you trade: none of these trades had a checklist, so the score uses your reviews only.');
    expect(document.querySelectorAll('.kairos-discipline-bar')).toHaveLength(1);
    text('No mistakes tagged in your reviews.');
  });

  it('shows an empty ring before any trade closes', () => {
    render(<DisciplineScorePanel periodLabel="September 2026" state={ready([])} />);
    expect(screen.getByRole('img', { name: 'Discipline score: not available yet' })).toBeTruthy();
    text('Your score appears when a trade closes in September 2026.');
  });

  it('uses the singular for one trade, and plain loading and error states', () => {
    const view = render(<DisciplineScorePanel periodLabel="September 2026" state={ready(['A'], record('A', null))} />);
    text('After the trade: you reviewed 1 of 1 closed trade (100%).');
    view.rerender(<DisciplineScorePanel periodLabel="September 2026" state={{ kind: 'loading' }} />);
    text('Loading your discipline score…');
    view.rerender(<DisciplineScorePanel periodLabel="September 2026" state={{ kind: 'error' }} />);
    text('Kairos could not work out your discipline score. Your stored trades were not changed.');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
