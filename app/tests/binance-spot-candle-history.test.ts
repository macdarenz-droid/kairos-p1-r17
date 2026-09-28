import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarketCandleHistoryRequest } from '../src/services/market-data/MarketCandleHistoryPort';
import { BINANCE_SPOT_CANDLE_INTERVALS, describeBinanceSpotCandleHistoryRequest } from '../src/services/market-data/providers/binance/binanceSpotCandleHistoryRequest';
import { decodeBinanceSpotCandleHistoryResponse } from '../src/services/market-data/providers/binance/binanceSpotCandleHistoryResponse';
import { createBinanceSpotCandleHistoryPort, type BinanceSpotCandleHistoryConnector } from '../src/services/market-data/providers/binance/binanceSpotCandleHistoryAcquisition';
import { connectBinanceSpotCandleHistoryBrowser } from '../src/services/market-data/providers/binance/binanceSpotCandleHistoryBrowserConnector';

const epoch = Date.parse('2026-09-01T00:00:00.000Z');
const observedAt = '2026-09-01T00:07:00.000Z';
const request = (overrides: Partial<MarketCandleHistoryRequest> = {}): MarketCandleHistoryRequest => ({ instrument: { venue:'binance-spot', symbol:'BTCUSDT' }, interval:'5m', limit:500, ...overrides });
// Synthetic provider-shaped test rows, never represented as actual market prices.
const candle = (time = epoch, prices = ['100.000000000000000001','102.0','99.0','101.123456789012345678']) => [time,...prices,'12.0',time+299999,'1200.0',3,'6.0','600.0','0'];
const response = (rows: unknown = [candle(),candle(epoch+300000)]) => ({ status:200, body:JSON.stringify(rows), retryAfter:null });
const descriptor = (scope=request()) => { const result=describeBinanceSpotCandleHistoryRequest(scope);if(!result.ok)throw Error(result.reason);return result.request; };
afterEach(()=>vi.unstubAllGlobals());

describe('Binance Spot bounded candle history',()=>{
  it('describes exact market, case-sensitive interval, UTC window and limit without aliasing or defaults',()=>{
    const source=request({instrument:{venue:'binance-spot',symbol:'BTCUSD'},startTimeMs:0,endTimeMs:epoch,limit:1000});
    const d=descriptor(source),url=new URL(d.url);
    expect(url.origin).toBe('https://data-api.binance.vision');expect(url.pathname).toBe('/api/v3/klines');
    expect(Object.fromEntries(url.searchParams)).toEqual({symbol:'BTCUSD',interval:'5m',limit:'1000',timeZone:'0',startTime:'0',endTime:String(epoch)});
    expect(d.scope.instrument.symbol).toBe('BTCUSD');expect(source.instrument.symbol).toBe('BTCUSD');
    for(const interval of BINANCE_SPOT_CANDLE_INTERVALS)expect(describeBinanceSpotCandleHistoryRequest(request({interval})).ok).toBe(true);
    expect(new URL(descriptor(request({instrument:{venue:'binance-spot',symbol:'币USDT'}})).url).searchParams.get('symbol')).toBe('币USDT');
    expect(new URL(descriptor().url).searchParams.has('startTime')).toBe(false);
    expect(new URL(descriptor().url).searchParams.has('endTime')).toBe(false);
  });
  it('rejects invalid scopes before transport',async()=>{
    const invalid=[request({instrument:{venue:'other',symbol:'BTCUSDT'}}),request({instrument:{venue:'binance-spot',symbol:' BTCUSDT'}}),request({instrument:{venue:'binance-spot',symbol:''}}),request({interval:'5M'}),...[-1,0,1001,1.5,NaN].map(limit=>request({limit})),request({startTimeMs:epoch+1,endTimeMs:epoch}),request({startTimeMs:-1}),request({endTimeMs:Infinity}),request({endTimeMs:8_640_000_000_000_001})];
    const connect=vi.fn<BinanceSpotCandleHistoryConnector>().mockResolvedValue(response());
    const port=createBinanceSpotCandleHistoryPort(connect,()=>observedAt);
    for(const scope of invalid)expect(await port.acquireHistory(scope)).toMatchObject({ok:false,reason:'invalid-request'});
    expect(await port.acquireHistory(null as unknown as MarketCandleHistoryRequest)).toMatchObject({ok:false,reason:'invalid-request'});
    expect(await port.acquireHistory(request({instrument:{venue:'binance-spot',symbol:'\uD800USDT'}}))).toMatchObject({ok:false,reason:'invalid-request'});
    expect(connect).not.toHaveBeenCalled();
  });
  it('maps complete consumed OHLC facts without binary rounding and retains a possibly forming last candle',async()=>{
    const now=vi.fn(()=>observedAt),port=createBinanceSpotCandleHistoryPort(async()=>response(),now);
    const r=await port.acquireHistory(request());expect(r.ok).toBe(true);if(!r.ok)return;
    expect(r.snapshot).toMatchObject({source:'market-reference',timeZone:'UTC',observedAt,request:request()});
    expect(r.snapshot.candles[0]).toEqual({openTime:'2026-09-01T00:00:00.000Z',closeTime:'2026-09-01T00:04:59.999Z',open:'100.000000000000000001',high:'102.0',low:'99.0',close:'101.123456789012345678'});
    expect(r.snapshot.candles[1].closeTime).toBe('2026-09-01T00:09:59.999Z');
    expect(now).toHaveBeenCalledTimes(1);expect(Object.isFrozen(r.snapshot.candles[0])).toBe(true);expect(Object.isFrozen(r.snapshot.candles)).toBe(true);
  });
  it('keeps decimal extremes exact and validates bounds through the existing decimal kernel',()=>{
    const values=['1'+'0'.repeat(400),'2'+'0'.repeat(400),'0.'+'0'.repeat(400)+'1','1'+'0'.repeat(400)];
    const r=decodeBinanceSpotCandleHistoryResponse(JSON.stringify([candle(epoch,values)]),descriptor());expect(r.ok).toBe(true);if(r.ok)expect(r.candles[0].low).toBe(values[2]);
  });
  it('distinguishes an empty page from malformed JSON, provider errors and excessive rows',async()=>{
    const connect=vi.fn<BinanceSpotCandleHistoryConnector>();const port=createBinanceSpotCandleHistoryPort(connect,()=>observedAt);
    connect.mockResolvedValueOnce(response([]));expect(await port.acquireHistory(request())).toMatchObject({ok:true,snapshot:{candles:[]}});
    for(const body of ['not json','null','{}','{"code":-1121,"msg":"Invalid symbol"}',JSON.stringify([candle(),candle(epoch+300000)])]){
      connect.mockResolvedValueOnce({status:200,body,retryAfter:null});expect(await port.acquireHistory(request({limit:1}))).toMatchObject({ok:false,reason:'invalid-response'});
    }
  });
  it('rejects the entire page for malformed prices, inconsistent OHLC and invalid timestamps or interval lengths',()=>{
    const rows: unknown[][]=[];
    for(const value of [100,'NaN','Infinity','0','-1','1e2','']){const row=candle();row[1]=value;rows.push(row);}
    rows.push(candle(epoch,['100','99','98','100']),candle(epoch,['100','101','101','100']));
    for(const [position,value] of [[0,-1],[0,NaN],[0,epoch+.5],[6,epoch-1],[6,epoch+59999],[6,8_640_000_000_000_001]]){const row=candle();row[position]=value;rows.push(row);}
    rows.push(candle().slice(0,7),[...candle(),'unexpected']);
    for(const row of rows)expect(decodeBinanceSpotCandleHistoryResponse(JSON.stringify([candle(epoch-300000),row]),descriptor()).ok).toBe(false);
  });
  it('rejects duplicate, reversed and overlapping bars without sorting or filling genuine gaps',()=>{
    for(const rows of [[candle(),candle()],[candle(epoch+300000),candle()],[candle(),candle(epoch+100000)]])expect(decodeBinanceSpotCandleHistoryResponse(JSON.stringify(rows),descriptor())).toMatchObject({ok:false,reason:'invalid-order'});
    const r=decodeBinanceSpotCandleHistoryResponse(JSON.stringify([candle(),candle(epoch+900000)]),descriptor());expect(r.ok).toBe(true);if(r.ok)expect(r.candles).toHaveLength(2);
  });
  it('enforces inclusive opening-time windows while allowing the last candle to close after endTime',()=>{
    const d=descriptor(request({startTimeMs:epoch,endTimeMs:epoch,limit:1}));
    expect(decodeBinanceSpotCandleHistoryResponse(JSON.stringify([candle()]),d).ok).toBe(true);
    for(const time of [epoch-300000,epoch+300000])expect(decodeBinanceSpotCandleHistoryResponse(JSON.stringify([candle(time)]),d)).toMatchObject({ok:false,reason:'outside-window'});
  });
  it('validates calendar-month duration across leap years and distinguishes 1M from 1m',()=>{
    const d=descriptor(request({interval:'1M'})),row=candle(Date.parse('2024-02-01T00:00:00Z'));row[6]=Date.parse('2024-03-01T00:00:00Z')-1;
    expect(decodeBinanceSpotCandleHistoryResponse(JSON.stringify([row]),d).ok).toBe(true);
    expect(decodeBinanceSpotCandleHistoryResponse(JSON.stringify([row]),descriptor(request({interval:'1m'}))).ok).toBe(false);
    row[6]=Date.parse('2024-02-29T00:00:00Z')-1;expect(decodeBinanceSpotCandleHistoryResponse(JSON.stringify([row]),d).ok).toBe(false);
  });
  it('preserves HTTP failure and Retry-After evidence with no automatic retry or fake empty result',async()=>{
    const connect=vi.fn<BinanceSpotCandleHistoryConnector>();const now=vi.fn(()=>observedAt);const port=createBinanceSpotCandleHistoryPort(connect,now);
    for(const status of [204,400,403,418,429,451,500]){connect.mockResolvedValueOnce({status,body:'[]',retryAfter:'60'});expect(await port.acquireHistory(request())).toEqual({ok:false,reason:'http-error',status,retryAfter:'60'});}
    expect(connect).toHaveBeenCalledTimes(7);expect(now).not.toHaveBeenCalled();
    connect.mockRejectedValueOnce(new Error('network'));expect(await port.acquireHistory(request())).toEqual({ok:false,reason:'transport-failed'});
  });
  it('cancels before transport and after an uncooperative transport, forwarding the original signal',async()=>{
    const connect=vi.fn<BinanceSpotCandleHistoryConnector>().mockResolvedValue(response());const now=vi.fn(()=>observedAt);const port=createBinanceSpotCandleHistoryPort(connect,now);
    const pre=new AbortController();pre.abort();expect(await port.acquireHistory(request(),{signal:pre.signal})).toEqual({ok:false,reason:'cancelled'});expect(connect).not.toHaveBeenCalled();
    const mid=new AbortController();let finish!:(r:Awaited<ReturnType<BinanceSpotCandleHistoryConnector>>)=>void;connect.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const pending=port.acquireHistory(request(),{signal:mid.signal});expect(connect.mock.calls[0][1]?.signal).toBe(mid.signal);mid.abort();finish(response());
    expect(await pending).toEqual({ok:false,reason:'cancelled'});expect(now).not.toHaveBeenCalled();
    const rejecting=new AbortController();connect.mockImplementationOnce(async()=>{rejecting.abort();throw new Error('aborted');});expect(await port.acquireHistory(request(),{signal:rejecting.signal})).toEqual({ok:false,reason:'cancelled'});
  });
  it('binds immutable scope per request when requests complete out of order or the caller mutates input',async()=>{
    const resolvers: Array<(r:Awaited<ReturnType<BinanceSpotCandleHistoryConnector>>)=>void>=[];
    const connect=vi.fn<BinanceSpotCandleHistoryConnector>(()=>new Promise(resolve=>resolvers.push(resolve))),port=createBinanceSpotCandleHistoryPort(connect,()=>observedAt);
    const source={instrument:{venue:'binance-spot',symbol:'BTCUSDT'},interval:'5m',limit:2};const a=port.acquireHistory(source);
    source.instrument.symbol='ETHUSDT';source.interval='1m';const b=port.acquireHistory(source);
    const minute=candle();minute[6]=epoch+59999;resolvers[1](response([minute]));const second=await b;resolvers[0](response());const first=await a;
    expect(first).toMatchObject({ok:true,snapshot:{request:{instrument:{symbol:'BTCUSDT'},interval:'5m'}}});
    expect(second).toMatchObject({ok:true,snapshot:{request:{instrument:{symbol:'ETHUSDT'},interval:'1m'}}});
    if(first.ok)expect(Object.isFrozen(first.snapshot.request.instrument)).toBe(true);
  });
  it('uses the existing receipt timestamp validator and never supplies an internal clock',async()=>{
    for(const stamp of ['', '2026-09-01', '2026-09-01T00:00:00+10:00'])expect(await createBinanceSpotCandleHistoryPort(async()=>response(),()=>stamp).acquireHistory(request())).toEqual({ok:false,reason:'observed-at-invalid'});
  });
  it('runs the production browser connector through the port with exact native fetch options and status/body handling',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify([candle()]),{status:200,headers:{'Retry-After':'3'}}));vi.stubGlobal('fetch',fetcher);
    const signal=new AbortController().signal,port=createBinanceSpotCandleHistoryPort(connectBinanceSpotCandleHistoryBrowser,()=>observedAt);
    expect(await port.acquireHistory(request(),{signal})).toMatchObject({ok:true,snapshot:{candles:[{open:'100.000000000000000001'}]}});
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(descriptor().url,{method:'GET',signal,credentials:'omit',redirect:'error',cache:'no-store'});
    fetcher.mockResolvedValueOnce(new Response('blocked',{status:429,headers:{'Retry-After':'10'}}));
    expect(await port.acquireHistory(request())).toEqual({ok:false,reason:'http-error',status:429,retryAfter:'10'});
  });
});
