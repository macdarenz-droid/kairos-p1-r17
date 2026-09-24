import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { JournalRoute } from '../src/app/JournalRoute';
import { saveManualTrade } from '../src/application/trades';
import {
  projectVisualPnlCumulativeRealizedPnl,
  projectVisualPnlProgressSeries,
  projectVisualPnlResultLine,
  writeVisualPnlTimeZonePreference,
  type VisualPnlDailySummary,
  type VisualPnlResultLineProjection,
} from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { DecimalString } from '../src/domain/trades';
import { ResultsLine } from '../src/features/journal/ResultsLine';

function day(dayKey: string, total: string): VisualPnlDailySummary {
  const outcome = total === '0' ? 'breakeven' : total.startsWith('-') ? 'loss' : 'profit';
  return { dayKey, timeZone: 'UTC', summary: { available: true, currency: 'USD', total: total as DecimalString, outcome, tradeCount: 1 } };
}
const line = (days: VisualPnlDailySummary[]) => projectVisualPnlResultLine(projectVisualPnlCumulativeRealizedPnl(projectVisualPnlProgressSeries(days)));

describe('ResultsLine', () => {
  it('draws the total so far from zero, with the exact numbers one tap away', () => {
    const projection = line([day('2026-09-01', '100'), day('2026-09-02', '-30')]);
    if (!projection.available) throw new Error(projection.reason);
    const { container } = render(<ResultsLine line={projection} />);
    const points = container.querySelector('polyline')!.getAttribute('points')!.split(' ');
    expect(points).toHaveLength(3);
    expect(points[0]).toBe(`0,${1000 - projection.zeroYStep}`);
    const picture = screen.getByRole('img');
    expect(picture.getAttribute('aria-label')).toContain('70 USD');
    expect(picture.getAttribute('aria-label')).toContain('2 days with results');
    const numbers = container.querySelector('details')!;
    expect(within(numbers).getByText('Show the numbers')).toBeInTheDocument();
    expect(numbers).toHaveTextContent('1 September 2026');
    expect(numbers).toHaveTextContent('100 USD');
    expect(numbers).toHaveTextContent('70 USD');
    expect(container.querySelector('.kairos-results-line__heading')).toHaveTextContent('▲');
    expect(screen.getByText('Only closed trades count. This is not your account balance.')).toBeInTheDocument();
  });

  it('marks a total below zero as a loss', () => {
    const projection = line([day('2026-09-01', '-20')]);
    const { container } = render(<ResultsLine line={projection} />);
    expect(container.querySelector('.kairos-results-line__heading')).toHaveTextContent('▼');
  });

  it.each([
    ['no-result-days', 'Your total appears after your first closed trade.'],
    ['mixed-currencies', "The total can't be drawn because your trades use more than one currency."],
    ['unavailable-result-day', "The total can't be drawn because at least one day has no result. Look for · on the calendar."],
    ['invalid-cumulative-decimal', 'The total could not be worked out. Your stored trades were not changed.'],
    ['invalid-scale-decimal', 'The total could not be worked out. Your stored trades were not changed.'],
  ] as const)('explains %s without drawing', (reason, message) => {
    render(<ResultsLine line={{ available: false, reason } as VisualPnlResultLineProjection} />);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });
});

const names: string[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-results-line-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db); return db;
}
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });
const closed = (symbol: string, dayKey: string, exitPrice: string) => ({ symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: `${dayKey}T09:00:00.000Z`, closedAt: `${dayKey}T10:00:00.000Z`, executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: `${dayKey}T09:00:00.000Z` }, { type: 'exit', price: exitPrice, quantity: '1', executedAt: `${dayKey}T10:00:00.000Z` }] } as const);

describe('the Journal result line', () => {
  it('shows the total so far as a picture', async () => {
    const db = await database();
    const now = () => '2026-09-10T12:00:00.000Z';
    await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now());
    expect((await saveManualTrade(db, closed('BTCUSDT', '2026-09-02', '150'))).ok).toBe(true);
    expect((await saveManualTrade(db, closed('ETHUSDT', '2026-09-03', '90'))).ok).toBe(true);
    render(<MemoryRouter><JournalRoute db={db} now={now} /></MemoryRouter>);
    expect(await screen.findByRole('img', { name: /^Total result so far: 40 USDT/ })).toBeInTheDocument();
  });
});
