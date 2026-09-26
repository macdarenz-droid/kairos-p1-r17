import 'fake-indexeddb/auto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor,cleanup} from '@testing-library/react';
import {MemoryRouter} from 'react-router';
import {HomeDashboardYourTrades} from '../src/app/HomeDashboardYourTrades';
import {createKairosDatabase,openKairosDatabase} from '../src/data/database';
import {createKairosRepositories} from '../src/data/repositories';
import {createTradeDomainId,parsePositiveDecimalString,type TradeId,type TradeExecutionId} from '../src/domain/trades';
import {loadHomeYourTrades,type HomeYourTrade} from '../src/application/dashboard/homeDashboardYourTradesQuery';
const row=(i:number):HomeYourTrade=>({id:String(i),symbol:'BTCUSDT',side:'long',status:'closed',outcome:'profit',resultLabel:'Profit',amount:'40',currency:null,source:'gross-pnl-zero-fees',timestamp:'2026-09-12T01:00:00Z'});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('Your Trades saved-result boundary',()=>{
 it('reads actual saved executions without inventing currency, percentage or market facts',async()=>{
   const db=createKairosDatabase('your-trades-'+crypto.randomUUID());await openKairosDatabase(db);const repo=createKairosRepositories(db);
   try{
     const id=createTradeDomainId<TradeId>();const time='2026-09-12T01:00:00.000Z';
     await repo.trades.put({id,symbol:'BTCUSDT',side:'long',marketType:'crypto',status:'closed',source:'manual',openedAt:time,closedAt:time,createdAt:time,updatedAt:time});
     const dec=(v:string)=>{const r=parsePositiveDecimalString(v);if(!r.ok)throw Error('fixture');return r.value;};
     for(const [type,price] of [['entry','100'],['exit','120']] as const)await repo.tradeExecutions.put({id:createTradeDomainId<TradeExecutionId>(),tradeId:id,type,price:dec(price),quantity:dec('2'),executedAt:time,createdAt:time});
     const rows=await loadHomeYourTrades(db);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({id,amount:'40',currency:null,resultLabel:'Profit',source:'net-pnl'});
     await repo.trades.put({...((await repo.trades.listRecentByUpdatedAt(1))[0]),status:'open',closedAt:null});
     expect((await loadHomeYourTrades(db))[0]).toMatchObject({amount:null,outcome:'unavailable',resultLabel:'Open'});
   }finally{db.close();await db.delete();}
 });
 it('provides loading, empty and recoverable error states',async()=>{
   const load=vi.fn().mockRejectedValueOnce(Error('read')).mockResolvedValue([]);
   render(<MemoryRouter><HomeDashboardYourTrades load={load}/></MemoryRouter>);
   expect(screen.getByRole('status')).toBeTruthy();await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Refresh'}));
   expect(await screen.findByText('Your trading story starts here')).toBeTruthy();expect(screen.getByRole('link',{name:'Log your first trade'}).getAttribute('href')).toBe('/journal');
 });
 it('pages individual identities without collapsing repeated symbols and exposes exact details',async()=>{
   vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(390);
   const load=vi.fn().mockResolvedValue(Array.from({length:14},(_,i)=>row(i)));
   const {container}=render(<MemoryRouter><HomeDashboardYourTrades load={load}/></MemoryRouter>);
   await waitFor(()=>expect(container.querySelectorAll('.kairos-your-trades__bubble')).toHaveLength(12));
   fireEvent.click(screen.getAllByRole('button',{name:/Show trade details/})[0]);expect(screen.getByText('Currency not recorded')).toBeTruthy();expect(screen.getByText('40')).toBeTruthy();
   fireEvent.click(screen.getByRole('button',{name:'Next'}));expect(container.querySelectorAll('.kairos-your-trades__bubble')).toHaveLength(2);expect(screen.getByText('Page 2 of 2')).toBeTruthy();expect(screen.queryByLabelText('Selected trade')).toBeNull();
 });
 it('ignores a stale asynchronous result after a newer loader takes over',async()=>{
   let resolve!:(v:readonly HomeYourTrade[])=>void;const old=()=>new Promise<readonly HomeYourTrade[]>(r=>{resolve=r;});const next=async()=>[];
   const {rerender}=render(<MemoryRouter><HomeDashboardYourTrades load={old}/></MemoryRouter>);
   rerender(<MemoryRouter><HomeDashboardYourTrades load={next}/></MemoryRouter>);await screen.findByText('Your trading story starts here');resolve([row(1)]);
   await waitFor(()=>expect(screen.getByText('0 saved · Latest 100')).toBeTruthy());
 });
});
