import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel } from './homeDashboardLiveCryptoBubbleReactRadiusScaleViewModel';
import { projectHomeDashboardLiveCryptoBubblePixelRadii } from '../application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusProjection';
import { glassMovementWeight, layoutGlassViewportCircles } from './homeDashboardGlassViewportLayout';
import { useHomeDashboardGlassMotion } from './useHomeDashboardGlassMotion';
import { removeGlassBlackMatte } from './homeDashboardGlassMaterial';
import { formatHomeDashboardLiveCryptoBubbleMovement } from './homeDashboardGlassBubbleFormatting';
import approvedGlassUrl from '../assets/kairos-glass-approved.png';
import './homeDashboardGlassBubbleMap.css';

let materialPromise: Promise<HTMLCanvasElement> | null = null;
function glassMaterial(): Promise<HTMLCanvasElement> {
  if (materialPromise) return materialPromise;
  materialPromise = new Promise<HTMLCanvasElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Glass canvas unavailable');
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        removeGlassBlackMatte(pixels.data);
        context.putImageData(pixels, 0, 0);
        resolve(canvas);
      } catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error('Glass image unavailable'));
    image.src = approvedGlassUrl;
  }).catch(error => { materialPromise = null; throw error; });
  return materialPromise;
}

export function GlassDecoration() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void glassMaterial().then(material => {
      if (!active || !ref.current) return;
      const context = ref.current.getContext('2d');
      if (!context) return;
      context.drawImage(material, 0, 0, 512, 512);
      setReady(true);
    }).catch(() => { /* The plain theme surface and market labels remain usable. */ });
    return () => { active = false; };
  }, []);
  return <canvas ref={ref} width={512} height={512} className="kairos-glass-art" data-glass-ready={ready} aria-hidden="true" />;
}

export function GlassIcon({ symbol }: { readonly symbol: string }) {
  const content = symbol === 'BTC' ? <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"><path d="M15 11h13c14 0 14 13 0 13H15m0 0h15c14 0 14 14 0 14H15M18 10v29M23 5v5m8-5v5M23 39v5m8-5v5" /></g>
    : symbol === 'ETH' ? <><path fill="currentColor" opacity=".8" d="M24 2 9 25l15 9 15-9Z"/><path fill="currentColor" d="m9 29 15 17 15-17-15 9Z"/></>
    : symbol === 'SOL' ? <path fill="currentColor" d="m12 7 30 0-8 8H4Zm-8 13h30l8 8H12Zm8 13h30l-8 8H4Z"/>
    : symbol === 'BNB' ? <g fill="currentColor"><path d="m24 2 10 10-5 5-5-5-5 5-5-5ZM2 24l9-9 9 9-9 9Zm26 0 9-9 9 9-9 9ZM14 36l5-5 5 5 5-5 5 5-10 10Z"/><path d="m18 24 6-6 6 6-6 6Z"/></g>
    : symbol === 'XRP' ? <g fill="none" stroke="currentColor" strokeWidth="4"><path d="m5 8 12 12q7 7 14 0L43 8M5 40l12-12q7-7 14 0l12 12"/></g>
    : symbol === 'LINK' ? <path fill="none" stroke="currentColor" strokeWidth="5" d="m24 4 17 10v20L24 44 7 34V14Z"/>
    : symbol === 'SUI' ? <g fill="none" stroke="currentColor" strokeWidth="3"><path d="M24 3C19 13 8 23 8 32a16 16 0 0 0 32 0C40 23 29 13 24 3Z"/><path d="M18 21c-6 17 22 5 15 21"/></g>
    : symbol === 'ADA' ? <g fill="currentColor">{Array.from({length:12},(_,i)=><circle key={i} cx={24+Math.cos(i*Math.PI/6)*(i%2?18:12)} cy={24+Math.sin(i*Math.PI/6)*(i%2?18:12)} r={i%2?1.8:2.5}/>)}<circle cx="24" cy="24" r="3"/></g> : null;
  return content ? <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">{content}</svg> : <>{symbol.slice(0,2)}</>;
}

// Identity and decorative phase belong to the instrument, never its current rank.
function instrumentIdentity(venue: string, symbol: string): string {
  return JSON.stringify([venue, symbol]);
}
function hoverTiming(identity: string) {
  let hash = 2166136261;
  for (let i = 0; i < identity.length; i++) hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619) >>> 0;
  return { duration: `${8.4 + (hash % 30) * 0.37}s`, delay: `${-(hash % 1024) / 80}s` };
}

export interface HomeDashboardGlassBubbleMapProps {
  readonly model: HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel;
  /** "Try again": the host remounts the live runtime. */
  readonly onRetry?: () => void;
}

/** A start that has not produced data by now is treated as unavailable. */
export const HOME_LIVE_MARKET_START_TIMEOUT_MS = 10_000;

export type HomeLiveMarketLoadState = 'data' | 'loading' | 'unavailable';

/** Data always wins; without data, a failed start, an offline device or a start past the time limit is unavailable. */
export function deriveHomeLiveMarketLoadState(input: {
  readonly hasData: boolean;
  readonly status: HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel['runtimeState']['status'];
  readonly online: boolean;
  readonly startTimedOut: boolean;
}): HomeLiveMarketLoadState {
  if (input.hasData) return 'data';
  if (input.status === 'acquisition-failed' || input.status === 'bootstrap-error' || !input.online) return 'unavailable';
  if (input.status === 'starting' && input.startTimedOut) return 'unavailable';
  return 'loading';
}

function readOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** HomeRoute presentation amendment: one released model, no acquisition hook.
 * Only this visual consumer measures bounds, chooses visual radii and packs.
 * Labels consume authoritative decimal strings and upstream semantic/freshness
 * states; only the constrained visual text is formatted here.
 */
export function HomeDashboardGlassBubbleMap({ model, onRetry }: HomeDashboardGlassBubbleMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      setWidth(element.clientWidth);
      const viewport = window.visualViewport?.height ?? window.innerHeight;
      const nav = document.querySelector('.kairos-shell__navigation')?.getBoundingClientRect();
      const bottom = nav && nav.width > window.innerWidth * .7 && nav.top > 0 ? Math.min(viewport,nav.top) : viewport;
      setHeight(Math.max(240, bottom - element.getBoundingClientRect().top - 16));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); };
  }, []);
  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  const [online, setOnline] = useState(readOnline);
  const [startTimedOut, setStartTimedOut] = useState(false);
  useEffect(() => {
    const update = () => setOnline(readOnline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const timeout = window.setTimeout(() => setStartTimedOut(true), HOME_LIVE_MARKET_START_TIMEOUT_MS);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); window.clearTimeout(timeout); };
  }, []);
  const source = model.radiusScaleProjection;
  const loadState = deriveHomeLiveMarketLoadState({ hasData: source !== null, status: model.runtimeState.status, online, startTimedOut });
  const projection = source && width >= 140 ? projectHomeDashboardLiveCryptoBubblePixelRadii(source, {
    minimumRadiusCssPixels: 48,
    maximumRadiusCssPixels: Math.max(48, Math.min(155, width * 0.225)),
  }) : null;
  const magnitudes = projection?.ok ? projection.entries.map(entry => {
    const value = entry.radiusScaleEntry.areaWeightEntry.presentationEntry.metricInput.movementPercent24h;
    return value === null ? NaN : Math.abs(Number(value));
  }) : [];
  const maximum = Math.max(0, ...magnitudes.filter(Number.isFinite));
  const entries = projection?.ok ? projection.entries.map((entry, index) => ({
    ...entry, radiusCssPixels: entry.radiusCssPixels === null || !Number.isFinite(magnitudes[index])
      ? null : glassMovementWeight(magnitudes[index], maximum),
  })) : [];
  const items = entries.flatMap(entry => {
    const presentation = entry.radiusScaleEntry.areaWeightEntry.presentationEntry;
    const key = instrumentIdentity(presentation.metricInput.instrument.venue, presentation.metricInput.instrument.symbol);
    return entry.radiusCssPixels === null ? [] : [{ key, radius: entry.radiusCssPixels }];
  });
  const geometryKey = JSON.stringify(items);
  const layout = useMemo(() => layoutGlassViewportCircles(JSON.parse(geometryKey), width, height), [geometryKey, width, height]);
  useHomeDashboardGlassMotion(container, layout.circles, width, layout.height, hidden);
  const positions = new Map(layout.circles.map(c => [c.key, c]));
  // Stable DOM order prevents React rank moves from restarting CSS animations.
  // The layout above still consumes the authoritative rank order unchanged.
  const renderedEntries = [...entries].sort((a, b) => {
    const ai = a.radiusScaleEntry.areaWeightEntry.presentationEntry.metricInput.instrument;
    const bi = b.radiusScaleEntry.areaWeightEntry.presentationEntry.metricInput.instrument;
    const ak = instrumentIdentity(ai.venue, ai.symbol), bk = instrumentIdentity(bi.venue, bi.symbol);
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });
  const stopped = hidden;

  return (
    <section className="kairos-glass-map" aria-label="Live Crypto Bubble map" data-motion={stopped ? 'paused' : 'running'}>
      <div className="kairos-glass-toolbar">
        <span>24h · size by % move</span>
      </div>
      {model.runtimeState.lastError !== null ? <p role="status">Market update failed. Showing the last available observations with their freshness labels.</p> : null}
      {loadState === 'unavailable' ? <div role="alert" className="kairos-glass-unavailable"><p>Live prices are unavailable. Check your connection.</p><button type="button" onClick={onRetry}>Try again</button></div>
        : loadState === 'loading' ? <p role="status">Loading live prices…</p>
        : source === null ? null : !source.ok ? <p role="status">Bubble data unavailable.</p> : source.entries.length === 0 ? <p role="status">No eligible markets available.</p> : null}
      <div ref={container} className="kairos-glass-field" style={{ height: layout.height }}>
        {renderedEntries.map(entry => {
          const p = entry.radiusScaleEntry.areaWeightEntry.presentationEntry;
          const metric = p.metricInput;
          const symbol = metric.instrument.symbol;
          const key = instrumentIdentity(metric.instrument.venue, symbol);
          const circle = positions.get(key);
          if (!circle) return null;
          const expired = p.freshnessState === 'expired' || p.freshnessState === 'missing';
          const value = formatHomeDashboardLiveCryptoBubbleMovement(metric.movementPercent24h, expired);
          const base = symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol;
          const timing = hoverTiming(key);
          const style = {
            left: circle.x - circle.radius, top: circle.y - circle.radius,
            width: circle.radius * 2, height: circle.radius * 2,
            // Small bubbles get a lower floor so the % label fits inside the circle.
            '--glass-label-size': `${Math.min(18, Math.max(circle.radius < 60 ? 9 : 11, circle.radius * 0.23))}px`,
            '--glass-icon-size': `${Math.min(38, Math.max(14, circle.radius * 0.5))}px`,
            '--glass-duration': timing.duration, '--glass-delay': timing.delay,
          } as CSSProperties;
          return <div key={key} className="kairos-glass-bubble" data-glass-key={key} data-identity={base === 'BTC' || base === 'ETH' ? base : undefined} data-movement={p.movementSemantic ?? 'neutral'} data-freshness={p.freshnessState} title={`${base} ${value}`} style={style}>
            <div className="kairos-glass-core" aria-hidden="true" />
            <div className="kairos-glass-smoke" aria-hidden="true" />
            <GlassDecoration />
            <div className="kairos-glass-label">
              <span className="kairos-glass-icon" data-fallback={!(['BTC','ETH','SOL','BNB','XRP','LINK','SUI','ADA'].includes(base))} aria-hidden="true"><GlassIcon symbol={base} /></span>
              <strong>{base}</strong><span className="kairos-glass-movement">{value}</span>
              <small hidden={p.freshnessState === 'fresh'}>{p.freshnessState}</small>
              <span className="kairos-glass-sr">{symbol}, {metric.instrument.venue}. 24 hour quote volume {metric.quoteVolume24h ?? 'unavailable'}.</span>
            </div>
          </div>;
        })}
      </div>
      {width > 0 && width < 140 ? <p>More space is needed to display the bubble map. </p> : null}
      {entries.some(e => e.radiusCssPixels === null) ? <p>Some markets have no bubble size available.</p> : null}
    </section>
  );
}
