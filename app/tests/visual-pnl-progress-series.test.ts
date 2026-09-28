import { describe, expect, it } from 'vitest';
import { projectVisualPnlProgressSeries, type VisualPnlDailySummary } from '../src/application/visual-pnl';
import { parseDecimalString } from '../src/domain/trades';
function dec(value:string){const p=parseDecimalString(value);if(!p.ok)throw new Error('bad fixture');return p.value;}
function day(dayKey:string,currency:string,total:string,outcome:'profit'|'loss'|'breakeven'):VisualPnlDailySummary{return Object.freeze({dayKey,timeZone:'UTC',summary:Object.freeze({available:true as const,currency,total:dec(total),outcome,tradeCount:1})});}
function unavailable(dayKey:string):VisualPnlDailySummary{return Object.freeze({dayKey,timeZone:'UTC',summary:Object.freeze({available:false as const,currency:null,total:null,outcome:null,tradeCount:2,reason:'mixed-currencies' as const})});}
describe('P13.17R1 Visual P&L progress-series semantics',()=>{
 it('returns unavailable with an empty readonly point collection when there are no result days',()=>expect(projectVisualPnlProgressSeries([])).toEqual({available:false,currency:null,points:[],reason:'no-result-days'}));
 it('passes through individual comparable daily realized results without accumulation',()=>expect(projectVisualPnlProgressSeries([day('2026-09-01','USD','10','profit'),day('2026-09-03','USD','-4','loss'),day('2026-09-04','USD','0','breakeven')])).toEqual({available:true,currency:'USD',points:[{dayKey:'2026-09-01',amount:dec('10'),outcome:'profit'},{dayKey:'2026-09-03',amount:dec('-4'),outcome:'loss'},{dayKey:'2026-09-04',amount:dec('0'),outcome:'breakeven'}]}));
 it('blocks the entire series when a daily result is unavailable',()=>expect(projectVisualPnlProgressSeries([day('2026-09-01','USD','10','profit'),unavailable('2026-09-02')])).toEqual({available:false,currency:null,points:[],reason:'unavailable-result-day'}));
 it('blocks mixed currencies instead of implying comparable progress',()=>expect(projectVisualPnlProgressSeries([day('2026-09-01','USD','10','profit'),day('2026-09-02','AUD','5','profit')])).toEqual({available:false,currency:null,points:[],reason:'mixed-currencies'}));
});
