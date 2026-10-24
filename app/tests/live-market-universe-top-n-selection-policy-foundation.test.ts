import { describe, expect, it } from 'vitest';
import { parseDecimalString, type DecimalString } from '../src/domain/trades';
import { DEFAULT_LIVE_MARKET_UNIVERSE_TOP_N_COUNT, selectLiveMarketUniverseTopN, type LiveMarketSummaryFact } from '../src/services/market-data';
function decimal(value: string): DecimalString { const parsed=parseDecimalString(value); if(!parsed.ok) throw new Error('bad decimal'); return parsed.value; }
function fact(symbol: string, quoteVolume24h='1'): LiveMarketSummaryFact { return {instrument:{venue:'binance-spot',symbol},lastPrice:decimal('1'),open24h:decimal('1'),high24h:decimal('1'),low24h:decimal('1'),baseVolume24h:decimal('1'),quoteVolume24h:decimal(quoteVolume24h),observedAt:'2026-09-09T00:00:00.000Z',sourceTimestamp:null}; }
describe('Live Market Universe Top-N selection policy',()=>{
  it('owns the product default count of 30',()=>{ expect(DEFAULT_LIVE_MARKET_UNIVERSE_TOP_N_COUNT).toBe(30); const ordered=Array.from({length:35},(_,index)=>fact(`S${String(index).padStart(2,'0')}USDT`)); expect(selectLiveMarketUniverseTopN(ordered)).toEqual(ordered.slice(0,30)); });
  it('selects the requested prefix without re-ranking or mutating caller order',()=>{ const ordered=[fact('ZUSDT','1'),fact('AUSDT','999'),fact('MUSDT','50')]; const selected=selectLiveMarketUniverseTopN(ordered,2); expect(selected).toEqual([ordered[0],ordered[1]]); expect(ordered.map(value=>value.instrument.symbol)).toEqual(['ZUSDT','AUSDT','MUSDT']); expect(selected).not.toBe(ordered); });
  it('returns all available facts when count exceeds availability',()=>{ const ordered=[fact('BTCUSDT'),fact('ETHUSDT')]; const selected=selectLiveMarketUniverseTopN(ordered,50); expect(selected).toEqual(ordered); expect(selected).not.toBe(ordered); });
  it.each([0,-1,1.5,Number.NaN,Number.POSITIVE_INFINITY,Number.NEGATIVE_INFINITY])('rejects invalid count %s deterministically',(count)=>{ expect(()=>selectLiveMarketUniverseTopN([],count)).toThrowError(new RangeError('Live Market Universe Top-N count must be a positive integer.')); });
});
