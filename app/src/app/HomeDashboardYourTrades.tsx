import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { ReviewTradeLink } from './ReviewTradeLink';
import { loadHomeYourTrades, YOUR_TRADES_HISTORY_LIMIT, type HomeYourTrade } from '../application/dashboard/homeDashboardYourTradesQuery';
import { GlassDecoration, GlassIcon } from './HomeDashboardGlassBubbleMap';
import { layoutGlassViewportCircles } from './homeDashboardGlassViewportLayout';
import { useHomeDashboardGlassMotion } from './useHomeDashboardGlassMotion';
import { projectYourTradeBubbleSizes } from './homeDashboardYourTradesSizing';
import './homeDashboardYourTrades.css';

export function HomeDashboardYourTrades({load=loadHomeYourTrades}:{readonly load?:()=>Promise<readonly HomeYourTrade[]>}) {
  const [trades,setTrades]=useState<readonly HomeYourTrade[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false);
  const [page,setPage]=useState(0),[selected,setSelected]=useState<string|null>(null),[revision,setRevision]=useState(0);
  const field=useRef<HTMLDivElement>(null),[bounds,setBounds]=useState({width:0,height:320}),[hidden,setHidden]=useState(false);
  const refresh=useCallback(()=>setRevision(x=>x+1),[]);
  useEffect(()=>{let active=true;setLoading(true);setError(false);
    void load().then(rows=>{if(active){setTrades(rows);setPage(0);setSelected(null);}}).catch(()=>{if(active)setError(true);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[load,revision]);
  useEffect(()=>{const visible=()=>{setHidden(document.hidden);if(!document.hidden)refresh();};
    document.addEventListener('visibilitychange',visible);window.addEventListener('focus',refresh);
    return()=>{document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',refresh);};
  },[refresh]);
  useEffect(()=>{
    const el=field.current;if(!el)return;
    const measure=()=>{const nav=document.querySelector('.kairos-shell__navigation')?.getBoundingClientRect();const viewport=window.visualViewport?.height??window.innerHeight;
      const bottom=nav&&nav.width>window.innerWidth*.7&&nav.top>0?Math.min(viewport,nav.top):viewport;
      const next={width:el.clientWidth,height:Math.max(240,bottom-el.getBoundingClientRect().top-12)};
      setBounds(old=>old.width===next.width&&old.height===next.height?old:next);
    };
    measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);observer?.observe(el);
    window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);
    return()=>{observer?.disconnect();window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure);};
  },[]);
  const pageCount=Math.max(1,Math.ceil(trades.length/12)),rows=trades.slice(page*12,(page+1)*12);
  const sizes=useMemo(()=>projectYourTradeBubbleSizes(trades),[trades]);
  const geometryKey=JSON.stringify(sizes.slice(page*12,(page+1)*12).map(({key,radius})=>({key,radius})));
  const layout=useMemo(()=>layoutGlassViewportCircles(JSON.parse(geometryKey),bounds.width,bounds.height),[geometryKey,bounds]);
  useHomeDashboardGlassMotion(field,layout.circles,bounds.width,layout.height,hidden||loading||error);
  const positions=new Map(layout.circles.map(c=>[c.key,c])),detail=trades.find(t=>t.id===selected);
  return <section className="kairos-your-trades kairos-glass-map" aria-label="Your Trades" data-motion={hidden?'paused':'running'}>
    <div className="kairos-your-trades__heading"><h2>Your Trades</h2><Link to="/journal">Log trade</Link></div>
    <p className="kairos-your-trades__caption">One bubble per trade · Bigger profits, smaller losses · Color shows result</p>
    <p className="kairos-your-trades__caption">Profit sizes compare the same recorded currency. Missing results stay neutral.</p>
    <div className="kairos-your-trades__controls"><span>{trades.length} saved · Latest {YOUR_TRADES_HISTORY_LIMIT}</span><button type="button" onClick={refresh} disabled={loading}>Refresh</button></div>
    <div className="kairos-your-trades__controls" aria-label="Trade pages"><button type="button" onClick={()=>{setPage(x=>x-1);setSelected(null);}} disabled={page===0||loading||error}>Previous</button><span>Page {page+1} of {pageCount}</span><button type="button" onClick={()=>{setPage(x=>x+1);setSelected(null);}} disabled={page+1>=pageCount||loading||error}>Next</button></div>
    <div ref={field} className="kairos-glass-field kairos-your-trades__field" style={{height:layout.height||bounds.height}}>
      {loading?<p role="status">Loading your saved trades…</p>:error?<p role="alert">Could not load your trades. Try Refresh.</p>:trades.length===0?<div className="kairos-your-trades__empty"><h3>Your trading story starts here</h3><p>Log a trade in your journal to see it here.</p><Link to="/journal">Log your first trade</Link></div>:rows.map(trade=>{
        const c=positions.get(trade.id);if(!c)return null;
        const base=trade.symbol.endsWith('USDT')?trade.symbol.slice(0,-4):trade.symbol;
        const movement=trade.outcome==='profit'?'positive':trade.outcome==='loss'?'negative':'neutral';
        const style={left:c.x-c.radius,top:c.y-c.radius,width:c.radius*2,height:c.radius*2,'--glass-label-size':`${Math.min(17,Math.max(11,c.radius*.23))}px`,'--glass-icon-size':`${Math.min(34,Math.max(14,c.radius*.45))}px`,'--glass-duration':'12s','--glass-delay':`${-(page*12+rows.indexOf(trade))*.8}s`} as CSSProperties;
        return <button type="button" key={trade.id} className="kairos-glass-bubble kairos-your-trades__bubble" data-glass-key={trade.id} data-movement={movement} data-identity={base==='BTC'||base==='ETH'?base:undefined} aria-label={`${trade.symbol}, ${trade.side}, ${trade.resultLabel}. Show trade details`} aria-pressed={selected===trade.id} onClick={()=>setSelected(trade.id)} style={style}>
          <div className="kairos-glass-core" aria-hidden="true"/><div className="kairos-glass-smoke" aria-hidden="true"/><GlassDecoration/>
          <span className="kairos-glass-label"><span className="kairos-glass-icon" data-fallback={!(['BTC','ETH','SOL','BNB','XRP','LINK','SUI','ADA'].includes(base))} aria-hidden="true"><GlassIcon symbol={base}/></span><strong>{trade.symbol}</strong><span className="kairos-glass-movement">{trade.resultLabel}</span></span>
        </button>;
      })}
      {detail&&!loading&&!error?<aside className="kairos-your-trades__detail" aria-label="Selected trade"><div className="kairos-your-trades__heading"><strong>{detail.symbol} · {detail.side}</strong><button type="button" onClick={()=>setSelected(null)}>Close details</button></div><p>{detail.status} · {detail.resultLabel}</p><p>{detail.amount===null?'Result not available':`${detail.amount}${detail.currency?' '+detail.currency:''}`}</p>{detail.amount!==null&&!detail.currency?<small>Currency not recorded</small>:null}<time dateTime={detail.timestamp}>{new Date(detail.timestamp).toLocaleString()}</time><ReviewTradeLink id={detail.id} /></aside>:null}
    </div>
  </section>;
}
