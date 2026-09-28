import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { JournalRoute } from '../src/app/JournalRoute';
import { listJournalHistory } from '../src/application/journal';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { createTradeDomainId, parseDecimalString, type TradeExecutionId, type TradeFeeId, type TradeId } from '../src/domain/trades';

const names = new Set<string>();
function dbName(): string { const name=`kairos-p127-${crypto.randomUUID()}`; names.add(name); return name; }
function dec(value:string) { const result=parseDecimalString(value); if (!result.ok) throw new Error('fixture decimal'); return result.value; }

afterEach(async () => {
  for (const name of names) await new Promise<void>((resolve,reject) => {
    const request=indexedDB.deleteDatabase(name);
    request.onsuccess=()=>resolve(); request.onerror=()=>reject(request.error); request.onblocked=()=>reject(new Error('blocked'));
  });
  names.clear();
});

describe('P12.7 Journal History closure', () => {
  it('composes persisted evidence through the indexed query owner and renders the same bounded history through the route filter', async () => {
    const db=createKairosDatabase(dbName());
    await openKairosDatabase(db);
    const repos=createKairosRepositories(db);
    const tradeId=createTradeDomainId<TradeId>();
    const entryId=createTradeDomainId<TradeExecutionId>();
    const exitId=createTradeDomainId<TradeExecutionId>();

    await repos.trades.put({ id:tradeId, symbol:'CLOSEOUT', marketType:'crypto', side:'long', status:'closed', source:'manual', openedAt:'2026-09-02T01:00:00.000Z', closedAt:'2026-09-02T02:00:00.000Z', createdAt:'2026-09-02T01:00:00.000Z', updatedAt:'2026-09-02T02:00:00.000Z' });
    await repos.tradeExecutions.put({ id:entryId, tradeId, type:'entry', price:dec('100'), quantity:dec('2'), executedAt:'2026-09-02T01:00:00.000Z', createdAt:'2026-09-02T01:00:00.000Z' });
    await repos.tradeExecutions.put({ id:exitId, tradeId, type:'exit', price:dec('120'), quantity:dec('2'), executedAt:'2026-09-02T02:00:00.000Z', createdAt:'2026-09-02T02:00:00.000Z' });
    await repos.tradeFees.put({ id:createTradeDomainId<TradeFeeId>(), tradeId, executionId:exitId, amount:dec('5'), currency:'USD', createdAt:'2026-09-02T02:00:00.000Z' });

    const history=await listJournalHistory(db,{status:'closed'});
    expect(history).toHaveLength(1);
    expect(history[0]?.trade.symbol).toBe('CLOSEOUT');
    expect(history[0]?.metrics?.grossPnl).toBe('40');
    expect(history[0]?.metrics?.totalFees).toBe('5');
    expect(history[0]?.metrics?.netPnl).toBeNull();

    render(<JournalRoute db={db} />);
    expect(await screen.findByText('CLOSEOUT')).toBeInTheDocument();
    expect(screen.getByText('1 shown')).toBeInTheDocument();
    const filter=screen.getByLabelText('Show trades');
    fireEvent.change(filter,{target:{value:'closed'}});
    await waitFor(()=>expect(filter).toHaveValue('closed'));
    await waitFor(()=>expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getAllByText('Not available').length).toBeGreaterThanOrEqual(1);
    db.close();
  });
});
