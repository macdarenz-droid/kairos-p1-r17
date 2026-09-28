import { describe, expect, it } from 'vitest';
import { projectTradeVisualizerDisplayModel, type TradeVisualizerFactsProjection } from '../src/application/trade-visualizer';
import { createTradeDomainId, parseDecimalString, type TradeExecutionId, type TradeId } from '../src/domain/trades';

function dec(v: string) { const r=parseDecimalString(v); if(!r.ok) throw new Error('bad fixture'); return r.value; }
function facts(overrides: Partial<TradeVisualizerFactsProjection> = {}): TradeVisualizerFactsProjection {
  return {
    tradeId:createTradeDomainId<TradeId>(), symbol:'BTCUSD', side:'long', status:'closed',
    planned:{entry:dec('100'),stop:dec('90'),target:dec('120')},
    executedEntries:[{executionId:createTradeDomainId<TradeExecutionId>(),price:dec('101'),quantity:dec('2'),executedAt:'2026-09-01T01:00:00Z'}],
    executedExits:[{executionId:createTradeDomainId<TradeExecutionId>(),price:dec('115'),quantity:dec('1'),executedAt:'2026-09-01T03:00:00Z'},{executionId:createTradeDomainId<TradeExecutionId>(),price:dec('118'),quantity:dec('1'),executedAt:'2026-09-02T00:00:00Z'}],
    ...overrides,
  };
}
describe('P14.2 Trade Visualizer display semantics',()=>{
  it('keeps planned and actual levels explicitly distinct',()=>{
    const model=projectTradeVisualizerDisplayModel(facts());
    expect(model.levels.map(x=>[x.kind,x.label,x.price])).toEqual([
      ['planned-entry','Planned entry',dec('100')],
      ['planned-stop','Planned stop',dec('90')],
      ['planned-target','Planned target',dec('120')],
      ['executed-entry','Actual entry',dec('101')],
      ['executed-exit','Actual exit 1',dec('115')],
      ['executed-exit','Actual exit 2',dec('118')],
    ]);
  });
  it('does not invent an actual exit for an open trade',()=>{
    const model=projectTradeVisualizerDisplayModel(facts({status:'open',executedEntries:[],executedExits:[]}));
    expect(model.levels.some(x=>x.kind==='executed-exit')).toBe(false);
  });
  it('omits absent planned levels rather than inventing prices',()=>{
    const model=projectTradeVisualizerDisplayModel(facts({planned:{entry:null,stop:null,target:null},executedEntries:[],executedExits:[]}));
    expect(model.levels).toEqual([]);
  });
});
