import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel } from './homeDashboardLiveCryptoBubbleReactRadiusScaleViewModel';
import { projectHomeDashboardLiveCryptoBubblePixelRadii } from '../application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusProjection';
import type { HomeDashboardLiveCryptoBubbleMovementSemantic } from '../application/dashboard/homeDashboardLiveCryptoBubblePresentationStateProjection';
import { glassMovementWeight, layoutGlassViewportCircles } from './homeDashboardGlassViewportLayout';
import { useHomeDashboardGlassMotion } from './useHomeDashboardGlassMotion';
import { removeGlassBlackMatte } from './homeDashboardGlassMaterial';
import { formatHomeDashboardLiveCryptoBubbleMovement } from './homeDashboardGlassBubbleFormatting';
import { describeMarketMove, MARKET_MOVE_PERIOD_WORDS, MARKET_MOVE_PERIODS, type MarketMovePeriod, type MarketMovesWindow } from '../application/markets/marketMoves';
import { describeMarketDataUnavailable, describeUpdatedAgo } from '../application/online/onlineWords';
import { decimalAbs, decimalCompare, decimalScaleToSteps } from '../domain/calculations/decimalKernel';
import type { DecimalString } from '../domain/trades';
import { Button, Segmented, UnavailableNotice } from '../design-system/primitives';
import { useNowEvery } from '../features/home/MarketSheet';
import approvedGlassUrl from '../assets/kairos-glass-approved.webp';
import './homeDashboardGlassBubbleMap.css';

/** The size the glass art is drawn at once; every bubble scales the same image (D273). */
const GLASS_SIZE = 512;
let glassUrl: string | null = null;
let materialPromise: Promise<string> | null = null;
/**
 * T-061a (D273): the approved glass art with its black matte removed, drawn once per page at 512×512 and shared by every
 * bubble as one image address, not a canvas per bubble.
 */
function glassMaterial(): Promise<string> {
  if (materialPromise) return materialPromise;
  materialPromise = new Promise<string>((resolve, reject) => {
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
        const art = document.createElement('canvas');
        art.width = GLASS_SIZE;
        art.height = GLASS_SIZE;
        const artContext = art.getContext('2d');
        if (!artContext) throw new Error('Glass canvas unavailable');
        artContext.drawImage(canvas, 0, 0, GLASS_SIZE, GLASS_SIZE);
        // The blob comes later, outside this try: its own failure must settle the promise too, so a later bubble retries.
        art.toBlob(blob => {
          try {
            if (blob === null) throw new Error('Glass image unavailable');
            glassUrl = URL.createObjectURL(blob);
            resolve(glassUrl);
          } catch (error) { reject(error); }
        }, 'image/png');
      } catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error('Glass image unavailable'));
    image.src = approvedGlassUrl;
  }).catch(error => { materialPromise = null; throw error; });
  return materialPromise;
}

/**
 * Where Home's bubble field may end on screen: above the phone's bottom bar, and above the page's bottom room, which on
 * Home is the room under "+ Log trade" (D225), so no bubble sits under the button.
 */
export function glassFieldBottom(element: HTMLElement): number {
  const viewport = window.visualViewport?.height ?? window.innerHeight;
  const nav = document.querySelector('.kairos-shell__navigation')?.getBoundingClientRect();
  const bar = nav && nav.width > window.innerWidth * .7 && nav.top > 0 ? Math.min(viewport, nav.top) : viewport;
  const main = element.closest('main');
  const room = main === null ? 0 : Number.parseFloat(getComputedStyle(main).paddingBottom) || 0;
  return Math.min(bar, viewport - room);
}

export function GlassDecoration() {
  const [url, setUrl] = useState(glassUrl);
  useEffect(() => {
    if (url !== null) return;
    let active = true;
    void glassMaterial().then(next => { if (active) setUrl(next); })
      .catch(() => { /* The plain theme surface and market labels remain usable. */ });
    return () => { active = false; };
  }, [url]);
  return url === null ? null : <img src={url} alt="" className="kairos-glass-art" data-glass-ready="true" aria-hidden="true" />;
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
/** A market bubble's key (its `data-glass-key`): the instrument, never its rank. */
export function instrumentIdentity(venue: string, symbol: string): string {
  return JSON.stringify([venue, symbol]);
}
function hoverTiming(identity: string) {
  let hash = 2166136261;
  for (let i = 0; i < identity.length; i++) hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619) >>> 0;
  return { duration: `${8.4 + (hash % 30) * 0.37}s`, delay: `${-(hash % 1024) / 80}s` };
}

/** T-061e (D271): the 1-hour or 7-day move of each market by symbol, with its colour, when that is what the bubbles show. */
export interface GlassMapShownMoves {
  readonly period: MarketMovesWindow;
  readonly values: ReadonlyMap<string, Readonly<{ percent: DecimalString | null; semantic: HomeDashboardLiveCryptoBubbleMovementSemantic | null }>>;
  /** When the source read these moves. */
  readonly observedAt: string;
}

/** T-061e: what sizes the bubbles. The configured runtime holds the choice and reads the moves. */
export interface GlassMapMoves {
  readonly chosen: MarketMovePeriod;
  readonly onChoose: (period: MarketMovePeriod) => void;
  /** null: the 24-hour move shows (chosen, or while the chosen moves load or after they failed). */
  readonly shown: GlassMapShownMoves | null;
  readonly loading: boolean;
  /** The moves that failed: the map is back on 24 hours. `retry` false: a retry cannot help. */
  readonly unavailable: Readonly<{ window: MarketMovesWindow; retry: boolean; busy: boolean }> | null;
  readonly onRetry: () => void;
}

export interface HomeDashboardGlassBubbleMapProps {
  readonly model: HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel;
  /** "Try again": the host remounts the live runtime. */
  readonly onRetry?: () => void;
  /** T-061e: the switch and the moves; without it the bubbles show the 24-hour move. */
  readonly moves?: GlassMapMoves;
  /** D255: coin names by coin (BTC → Bitcoin), when Kairos is sure of them. */
  readonly names?: ReadonlyMap<string, string> | null;
  /** T-061e: a bubble's tap, click or Enter opens its details; the key is the bubble's `data-glass-key`. */
  readonly onOpen?: (key: string) => void;
  /** The map's section, for a host that gives the focus back to a bubble. */
  readonly sectionRef?: RefObject<HTMLElement | null>;
}

const SIZE_STEPS = 1_000;
const PERIOD_OPTIONS = MARKET_MOVE_PERIODS.map(value => Object.freeze({ value, label: MARKET_MOVE_PERIOD_WORDS[value] }));
const MOVE_NAME: Readonly<Record<MarketMovePeriod, string>> = Object.freeze({ '1h': '1-hour', '24h': '24-hour', '7d': '7-day' });
const DRAWN_ICONS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'LINK', 'SUI', 'ADA'];
const AGO_TICK_MS = 5_000;

/** For drawing only: each move's size in steps of the biggest |move| shown (exact, through the kernel); null when unknown. */
function moveSteps(values: readonly (DecimalString | null)[]): readonly (number | null)[] {
  const sizes = values.map(value => {
    if (value === null) return null;
    const size = decimalAbs(value);
    return size.ok ? size.value : null;
  });
  let biggest: DecimalString | null = null;
  for (const size of sizes) if (size !== null && (biggest === null || (decimalCompare(size, biggest) ?? 0) > 0)) biggest = size;
  return sizes.map(size => size === null ? null : biggest === null || decimalCompare(biggest, '0') === 0 ? 0 : decimalScaleToSteps(size, biggest, SIZE_STEPS));
}

/** "BTC, Bitcoin, up 2.3% in 24 hours, price 2 min ago. Show details": every word the bubble shows, and what a tap does. */
function bubbleName(base: string, name: string | null, period: MarketMovePeriod, percent: DecimalString | null, ago: string | null): string {
  const words = describeMarketMove(percent);
  const move = words === null ? `${MOVE_NAME[period]} move not available`
    : `${words.direction === 'none' ? 'no change' : `${words.direction} ${words.size}`} in ${MARKET_MOVE_PERIOD_WORDS[period]}`;
  return `${[base, name, move, ago === null ? null : `price ${ago}`].filter(part => part !== null).join(', ')}. Show details`;
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
 * T-061e (D271): each bubble is a button that opens its details; the switch chooses the move that sizes and labels the
 * bubbles (the moves come from their owner, application/markets/marketMoves.ts); "Prices updated … ago" sits under the field.
 */
export function HomeDashboardGlassBubbleMap({ model, onRetry, moves, names = null, onOpen, sectionRef }: HomeDashboardGlassBubbleMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const updated = useRef<HTMLParagraphElement>(null);
  const remeasure = useRef<(() => void) | null>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      setWidth(element.clientWidth);
      // The "Prices updated" line under the field keeps its room above the bottom.
      const below = updated.current?.offsetHeight ?? 0;
      setHeight(Math.max(240, glassFieldBottom(element) - element.getBoundingClientRect().top - 16 - below));
    };
    remeasure.current = measure;
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    // What shows above the field (Getting started) moves it down; the page around it changes size then.
    const main = element.closest('main');
    if (main !== null) observer?.observe(main);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => { remeasure.current = null; observer?.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); };
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
  const now = useNowEvery(AGO_TICK_MS, !hidden);
  const source = model.radiusScaleProjection;
  const loadState = deriveHomeLiveMarketLoadState({ hasData: source !== null, status: model.runtimeState.status, online, startTimedOut });
  // The port's reason when it gave one; otherwise offline or a source that did not answer.
  const unavailable = loadState === 'unavailable' ? describeMarketDataUnavailable(
    model.runtimeState.unavailable ?? { ok: false, reason: 'unavailable', why: online ? 'source-down' : 'offline', retryAfterSeconds: null },
    'Live prices',
  ) : null;
  const projection = source && width >= 140 ? projectHomeDashboardLiveCryptoBubblePixelRadii(source, {
    minimumRadiusCssPixels: 48,
    maximumRadiusCssPixels: Math.max(48, Math.min(155, width * 0.225)),
  }) : null;
  const shown = moves?.shown ?? null;
  const period: MarketMovePeriod = shown?.period ?? '24h';
  const moveOf = (metric: { readonly instrument: { readonly symbol: string }; readonly movementPercent24h: DecimalString | null }): DecimalString | null =>
    shown === null ? metric.movementPercent24h : shown.values.get(metric.instrument.symbol)?.percent ?? null;
  const steps = projection?.ok ? moveSteps(projection.entries.map(entry => moveOf(entry.radiusScaleEntry.areaWeightEntry.presentationEntry.metricInput))) : [];
  const entries = projection?.ok ? projection.entries.map((entry, index) => ({
    ...entry, radiusCssPixels: entry.radiusCssPixels === null || steps[index] === null
      ? null : glassMovementWeight(steps[index]!, SIZE_STEPS),
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
  // A line that comes or goes above the field moves it: measure again so it still ends above the bottom.
  const above = `${moves?.loading === true}|${moves?.unavailable?.window ?? ''}|${model.runtimeState.lastError !== null}|${unavailable !== null}|${loadState}`;
  useLayoutEffect(() => { remeasure.current?.(); }, [above]);

  const observed = entries.flatMap(entry => {
    const at = Date.parse(entry.radiusScaleEntry.areaWeightEntry.presentationEntry.metricInput.fact?.observedAt ?? '');
    return Number.isFinite(at) ? [at] : [];
  });
  const pricesAgo = observed.length === 0 ? null : describeUpdatedAgo(now - Math.max(...observed));
  const movesAgo = shown === null ? null : describeUpdatedAgo(now - Date.parse(shown.observedAt));
  const retryMoves = () => {
    // "Try again" goes away while the moves load: the switch's choice holds the focus (never the page).
    const window = moves?.unavailable?.window;
    if (window !== undefined) toolbar.current?.querySelectorAll<HTMLElement>('button')[MARKET_MOVE_PERIODS.indexOf(window)]?.focus();
    moves?.onRetry();
  };

  return (
    <section ref={sectionRef} className="kairos-glass-map" aria-label="Live Crypto Bubble map" data-motion={stopped ? 'paused' : 'running'}>
      {moves === undefined ? null : <div ref={toolbar} className="kairos-glass-toolbar">
        <span aria-hidden="true">Size by the move in</span>
        <Segmented label="Size by the move in" options={PERIOD_OPTIONS} value={moves.chosen} onChange={moves.onChoose} />
      </div>}
      {moves?.loading ? <p role="status">{`Loading ${MOVE_NAME[moves.chosen]} moves…`}</p> : null}
      {moves?.unavailable ? <p className="kairos-glass-moves-unavailable" role="status">{`${MOVE_NAME[moves.unavailable.window]} moves are unavailable right now.`}
        {moves.unavailable.retry ? <> <Button variant="ghost" size="sm" aria-disabled={moves.unavailable.busy || undefined} aria-busy={moves.unavailable.busy || undefined}
          onClick={() => { if (!moves.unavailable?.busy) retryMoves(); }}>Try again</Button></> : null}</p> : null}
      {model.runtimeState.lastError !== null ? <p role="status">Market update failed. Showing the last available observations with their freshness labels.</p> : null}
      {unavailable !== null ? <div className="kairos-glass-unavailable"><UnavailableNotice message={unavailable.message} retryLabel={unavailable.retryLabel} onRetry={onRetry} retryWhenOnline={unavailable.retryWhenOnline} /></div>
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
          // The 24-hour move of an expired price is not shown as now; a 1-hour or 7-day move has its own read.
          const percent = shown === null ? (expired ? null : metric.movementPercent24h) : moveOf(metric);
          const value = formatHomeDashboardLiveCryptoBubbleMovement(percent, percent === null);
          const semantic = shown === null ? p.movementSemantic : shown.values.get(symbol)?.semantic ?? null;
          const base = symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol;
          const observedAt = Date.parse(metric.fact?.observedAt ?? '');
          const ago = p.freshnessState === 'fresh' ? null : describeUpdatedAgo(Number.isFinite(observedAt) ? now - observedAt : metric.ageMs ?? Number.NaN);
          const timing = hoverTiming(key);
          const style = {
            left: circle.x - circle.radius, top: circle.y - circle.radius,
            width: circle.radius * 2, height: circle.radius * 2,
            // Small bubbles get a lower floor so the % label fits inside the circle.
            '--glass-label-size': `${Math.min(18, Math.max(circle.radius < 60 ? 9 : 11, circle.radius * 0.23))}px`,
            '--glass-icon-size': `${Math.min(38, Math.max(14, circle.radius * 0.5))}px`,
            '--glass-duration': timing.duration, '--glass-delay': timing.delay,
          } as CSSProperties;
          return <button type="button" key={key} className="kairos-glass-bubble" data-glass-key={key} data-identity={base === 'BTC' || base === 'ETH' ? base : undefined} data-movement={semantic ?? 'neutral'} data-freshness={p.freshnessState}
            aria-label={bubbleName(base, names?.get(base) ?? null, period, percent, ago)} onClick={() => onOpen?.(key)} style={style}>
            <span className="kairos-glass-core" aria-hidden="true" />
            <span className="kairos-glass-smoke" aria-hidden="true" />
            <GlassDecoration />
            <span className="kairos-glass-label" aria-hidden="true">
              <span className="kairos-glass-icon" data-fallback={!DRAWN_ICONS.includes(base)}><GlassIcon symbol={base} /></span>
              <strong>{base}</strong><span className="kairos-glass-movement">{value}</span>
              {ago === null ? null : <small className="kairos-glass-ago">{ago}</small>}
            </span>
          </button>;
        })}
      </div>
      <p ref={updated} className="kairos-glass-updated">{pricesAgo === null ? '\u00a0' : `Prices updated ${pricesAgo}${movesAgo === null ? '' : ` · ${MOVE_NAME[period]} moves ${movesAgo}`}`}</p>
      {width > 0 && width < 140 ? <p>More space is needed to display the bubble map. </p> : null}
      {entries.some(e => e.radiusCssPixels === null) ? <p>Some markets have no bubble size available.</p> : null}
    </section>
  );
}
