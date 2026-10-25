import { describe, expect, it } from 'vitest';
import { parseDecimalString, type DecimalString } from '../src/domain/trades';
import { orderLiveMarketUniverseByQuoteVolume, type LiveMarketSummaryFact } from '../src/services/market-data';
function decimal(value:string):DecimalString { const p=parseDecimalString(value); if(!p.ok) throw new Error('bad decimal'); return p.value; }
function fact(symbol:string,q:string):LiveMarketSummaryFact { return {instrument:{venue:'binance-spot',symbol},lastPrice:decimal('1'),open24h:decimal('1'),high24h:decimal('1'),low24h:decimal('1'),baseVolume24h:decimal('1'),quoteVolume24h:decimal(q),observedAt:'2026-09-09T00:00:00.000Z',sourceTimestamp:null}; }
describe('quote-volume ordering policy',()=>{
  it('orders exact descending quote volume',()=>{const a=[fact('ETHUSDT','99999999999999999999999.9999'),fact('BTCUSDT','100000000000000000000000.0001'),fact('SOLUSDT','100000000000000000000000')]; expect(orderLiveMarketUniverseByQuoteVolume(a).map(x=>x.instrument.symbol)).toEqual(['BTCUSDT','SOLUSDT','ETHUSDT']);});
  it('ties by symbol',()=>{const a=[fact('XRPUSDT','42'),fact('ADAUSDT','42'),fact('BTCUSDT','42')]; expect(orderLiveMarketUniverseByQuoteVolume(a).map(x=>x.instrument.symbol)).toEqual(['ADAUSDT','BTCUSDT','XRPUSDT']);});
  it('does not mutate caller order',()=>{const a=[fact('LOWUSDT','1'),fact('HIGHUSDT','2')]; const b=orderLiveMarketUniverseByQuoteVolume(a); expect(b.map(x=>x.instrument.symbol)).toEqual(['HIGHUSDT','LOWUSDT']); expect(a.map(x=>x.instrument.symbol)).toEqual(['LOWUSDT','HIGHUSDT']); expect(b).not.toBe(a);});
});
