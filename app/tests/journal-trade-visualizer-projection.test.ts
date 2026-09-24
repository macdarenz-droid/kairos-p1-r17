import { describe, expect, it } from 'vitest';
import { projectJournalTradeVisualizer } from '../src/application/trade-visualizer';
import { projectVisualPnlOutcome } from '../src/application/visual-pnl';
import {
  createTradeDomainId, parseDecimalString,
  type TradeExecutionId, type TradeId, type TradePlanId,
} from '../src/domain/trades';
import type { JournalHistoryEntry } from '../src/application/journal/historyQuery';

function dec(v:string){const r=parseDecimalString(v);if(!r.ok)throw new Error('bad fixture');return r.value;}
const tradeId=createTradeDomainId<TradeId>();

function entry(status:'open'|'closed'='closed'):JournalHistoryEntry{
 return {
  trade:{id:tradeId,symbol:'BTCUSD',marketType:'crypto',side:'long',status,source:'manual',openedAt:'2026-09-01T00:00:00Z',closedAt:status==='closed'?'2026-09-02T00:00:00Z':null,createdAt:'2026-09-01T00:00:00Z',updatedAt:'2026-09-02T00:00:00Z'},
  plans:[{id:createTradeDomainId<TradePlanId>(),tradeId,plannedEntryPrice:dec('100'),plannedStopPrice:dec('90'),plannedTargetPrice:dec('120'),plannedQuantity:dec('2'),createdAt:'2026-09-01T00:00:00Z',updatedAt:'2026-09-01T00:00:00Z'}],
  executions:status==='closed'?[{id:createTradeDomainId<TradeExecutionId>(),tradeId,type:'exit',price:dec('115'),quantity:dec('2'),executedAt:'2026-09-02T00:00:00Z',createdAt:'2026-09-02T00:00:00Z'}]:[],
  fees:[],metrics:null,metricsError:null,visualPnl:projectVisualPnlOutcome(null),
 };
}
describe('P14.3 Journal Trade Visualizer projection wiring',()=>{
 it('reuses the hydrated Journal entry and preserves planned versus actual semantics',()=>{
  const model=projectJournalTradeVisualizer(entry());
  expect(model.levels.map(x=>x.label)).toEqual(['Planned entry','Planned stop','Planned target','Actual exit']);
 });
 it('does not invent an actual exit for hydrated open Journal entries',()=>{
  expect(projectJournalTradeVisualizer(entry('open')).levels.some(x=>x.kind==='executed-exit')).toBe(false);
 });
});
