import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AppShell } from '../../src/app/AppShell';
import { HomeDashboardYourTrades } from '../../src/app/HomeDashboardYourTrades';
import { applyTheme, type ThemeId } from '../../src/design-system/themes/themeEngine';
import { kairosDatabase, openKairosDatabase } from '../../src/data/database';
import { createKairosRepositories } from '../../src/data/repositories';
import { createTradeDomainId, parsePositiveDecimalString, type TradeId, type TradeExecutionId } from '../../src/domain/trades';
import '../../src/shell.css';
import '../../src/design-system/accessibility.css';
import '../../src/design-system/tokens.css';
import '../../src/design-system/shell/navigationShell.css';

const root=createRoot(document.getElementById('sizing-root')!);
const fixtures: {id:TradeId; exitId:TradeExecutionId|null}[]=[];
const decimal=(s:string)=>{const r=parsePositiveDecimalString(s);if(!r.ok)throw Error('fixture decimal');return r.value;};
export async function seed(count=6) {
  await openKairosDatabase(kairosDatabase);
  const repo=createKairosRepositories(kairosDatabase),time='2026-09-12T01:00:00.000Z';
  const entries=[['BTCUSDT','120'],['ETHUSDT','300'],['SOLUSDT','2100'],['XRPUSDT','50'],['BNBUSDT','100'],['ADAUSDT',null]];
  for(let i=fixtures.length;i<count;i++) {
    const [symbol,exit]=entries[i%entries.length],id=createTradeDomainId<TradeId>();
    await repo.trades.put({id,symbol:symbol!,marketType:'crypto',source:'manual',side:'long',status:exit===null?'open':'closed',grossPnlCurrency:'USDT',openedAt:time,closedAt:exit===null?null:time,createdAt:time,updatedAt:time});
    await repo.tradeExecutions.put({id:createTradeDomainId<TradeExecutionId>(),tradeId:id,type:'entry',price:decimal('100'),quantity:decimal('1'),executedAt:time,createdAt:time});
    const exitId=exit===null?null:createTradeDomainId<TradeExecutionId>();
    if(exitId&&exit)await repo.tradeExecutions.put({id:exitId,tradeId:id,type:'exit',price:decimal(exit),quantity:decimal('1'),executedAt:time,createdAt:time});
    fixtures.push({id,exitId});
  }
}
export function mount(){root.render(<MemoryRouter><Routes><Route element={<AppShell/>}><Route path="/" element={<section className="kairos-route"><HomeDashboardYourTrades/></section>}/></Route></Routes></MemoryRouter>);}
export function theme(id:ThemeId){applyTheme(document.documentElement,id);}
export async function snapshot(){return {trades:await kairosDatabase.trades.toArray(),executions:await kairosDatabase.tradeExecutions.toArray(),fees:await kairosDatabase.tradeFees.toArray()};}
export async function increaseFirstProfit(){
  const id=fixtures[0].exitId;if(!id)throw Error('missing fixture');
  const execution=await kairosDatabase.tradeExecutions.get(id);if(!execution)throw Error('missing execution');
  await createKairosRepositories(kairosDatabase).tradeExecutions.put({...execution,price:decimal('20100')});
}
