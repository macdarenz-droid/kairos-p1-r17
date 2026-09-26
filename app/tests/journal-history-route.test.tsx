import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { JournalRoute } from '../src/app/JournalRoute';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { createTradeDomainId, type TradeId } from '../src/domain/trades';

const names = new Set<string>();
const dbName = () => { const value = `kairos-p123r1-${crypto.randomUUID()}`; names.add(value); return value; };
afterEach(async () => { for (const name of names) await new Promise<void>((resolve, reject) => { const request=indexedDB.deleteDatabase(name); request.onsuccess=()=>resolve(); request.onerror=()=>reject(request.error); request.onblocked=()=>reject(new Error('blocked')); }); names.clear(); });

describe('P12.3R1 journal history route presentation', () => {
  it('renders persisted history through the P12 query without direct storage access in the component', async () => {
    const db=createKairosDatabase(dbName()); await openKairosDatabase(db); const repos=createKairosRepositories(db);
    await repos.trades.put({ id:createTradeDomainId<TradeId>(), symbol:'BTCUSD', marketType:'crypto', side:'long', status:'draft', source:'manual', openedAt:null, closedAt:null, createdAt:'2026-09-02T01:00:00.000Z', updatedAt:'2026-09-02T01:00:00.000Z' });
    render(<JournalRoute db={db} />);
    expect(await screen.findByRole('heading',{name:'Trade history'})).toBeInTheDocument();
    expect(await screen.findByText('BTCUSD')).toBeInTheDocument();
    expect(screen.getByText('1 shown')).toBeInTheDocument();
    db.close();
  });

  it('shows an empty state and refreshes history after a successful manual save without stealing the existing save status role', async () => {
    const db=createKairosDatabase(dbName()); await openKairosDatabase(db);
    render(<JournalRoute db={db} />);
    expect(await screen.findByText('No saved trades yet. Your first saved trade will appear here.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Symbol/),{target:{value:'AAPL'}});
    fireEvent.change(screen.getByLabelText(/Market/),{target:{value:'stock'}});
    fireEvent.change(screen.getByLabelText(/Direction/),{target:{value:'long'}});
    fireEvent.change(screen.getByLabelText(/Status/),{target:{value:'cancelled'}});
    fireEvent.click(screen.getByRole('button',{name:'Save trade'}));
    expect(await screen.findByRole('status')).toHaveTextContent('Trade saved to your journal.');
    await waitFor(()=>expect(screen.getByText('1 shown')).toBeInTheDocument());
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    db.close();
  });

  it('filters journal history by status through the indexed query owner and returns to all trades', async () => {
    const db=createKairosDatabase(dbName()); await openKairosDatabase(db); const repos=createKairosRepositories(db);
    const common={ marketType:'crypto' as const, side:'long' as const, source:'manual' as const, createdAt:'2026-09-02T01:00:00.000Z' };
    await repos.trades.put({ ...common, id:createTradeDomainId<TradeId>(), symbol:'DRAFTUSD', status:'draft', openedAt:null, closedAt:null, updatedAt:'2026-09-02T01:00:00.000Z' });
    await repos.trades.put({ ...common, id:createTradeDomainId<TradeId>(), symbol:'OPENUSD', status:'open', openedAt:'2026-09-02T01:10:00.000Z', closedAt:null, updatedAt:'2026-09-02T01:10:00.000Z' });
    await repos.trades.put({ ...common, id:createTradeDomainId<TradeId>(), symbol:'CLOSEDUSD', status:'closed', openedAt:'2026-09-02T01:20:00.000Z', closedAt:'2026-09-02T01:30:00.000Z', updatedAt:'2026-09-02T01:30:00.000Z' });
    await repos.trades.put({ ...common, id:createTradeDomainId<TradeId>(), symbol:'CANCELUSD', status:'cancelled', openedAt:null, closedAt:null, updatedAt:'2026-09-02T01:40:00.000Z' });

    render(<JournalRoute db={db} />);
    expect(await screen.findByText('4 shown')).toBeInTheDocument();
    const filter=screen.getByLabelText('Show trades');

    fireEvent.change(filter,{target:{value:'closed'}});
    await waitFor(()=>expect(screen.getByText('1 shown')).toBeInTheDocument());
    expect(screen.getByText('CLOSEDUSD')).toBeInTheDocument();
    expect(screen.queryByText('DRAFTUSD')).not.toBeInTheDocument();
    expect(screen.queryByText('OPENUSD')).not.toBeInTheDocument();
    expect(screen.queryByText('CANCELUSD')).not.toBeInTheDocument();

    fireEvent.change(filter,{target:{value:''}});
    await waitFor(()=>expect(screen.getByText('4 shown')).toBeInTheDocument());
    expect(screen.getByText('DRAFTUSD')).toBeInTheDocument();
    expect(screen.getByText('OPENUSD')).toBeInTheDocument();
    expect(screen.getByText('CLOSEDUSD')).toBeInTheDocument();
    expect(screen.getByText('CANCELUSD')).toBeInTheDocument();
    db.close();
  });

  it('shows a filter-specific empty state and keeps the P10 save status role unique', async () => {
    const db=createKairosDatabase(dbName()); await openKairosDatabase(db); const repos=createKairosRepositories(db);
    await repos.trades.put({ id:createTradeDomainId<TradeId>(), symbol:'ONLYDRAFT', marketType:'stock', side:'long', status:'draft', source:'manual', openedAt:null, closedAt:null, createdAt:'2026-09-02T01:00:00.000Z', updatedAt:'2026-09-02T01:00:00.000Z' });
    render(<JournalRoute db={db} />);
    expect(await screen.findByText('ONLYDRAFT')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Show trades'),{target:{value:'closed'}});
    expect(await screen.findByText('No closed trades found.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    db.close();
  });

  it('keeps the latest status selection authoritative across rapid filter changes', async () => {
    const db=createKairosDatabase(dbName()); await openKairosDatabase(db); const repos=createKairosRepositories(db);
    await repos.trades.put({ id:createTradeDomainId<TradeId>(), symbol:'DRAFTFAST', marketType:'stock', side:'long', status:'draft', source:'manual', openedAt:null, closedAt:null, createdAt:'2026-09-02T01:00:00.000Z', updatedAt:'2026-09-02T01:00:00.000Z' });
    await repos.trades.put({ id:createTradeDomainId<TradeId>(), symbol:'CANCELFAST', marketType:'stock', side:'short', status:'cancelled', source:'manual', openedAt:null, closedAt:null, createdAt:'2026-09-02T01:01:00.000Z', updatedAt:'2026-09-02T01:01:00.000Z' });
    render(<JournalRoute db={db} />);
    expect(await screen.findByText('2 shown')).toBeInTheDocument();
    const filter=screen.getByLabelText('Show trades');
    fireEvent.change(filter,{target:{value:'draft'}});
    fireEvent.change(filter,{target:{value:'cancelled'}});
    await waitFor(()=>expect(screen.getByText('CANCELFAST')).toBeInTheDocument());
    expect(screen.queryByText('DRAFTFAST')).not.toBeInTheDocument();
    expect(filter).toHaveValue('cancelled');
    db.close();
  });

});
