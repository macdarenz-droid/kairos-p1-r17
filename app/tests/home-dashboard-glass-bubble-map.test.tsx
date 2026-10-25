import { act, render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeDashboardGlassBubbleMap } from '../src/app/HomeDashboardGlassBubbleMap';
import { HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime } from '../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime';
import { GLASS_HOLD_MS } from '../src/app/homeDashboardGlassDrag';
import { layoutGlassCircles } from '../src/app/homeDashboardGlassLayout';
import { removeGlassBlackMatte } from '../src/app/homeDashboardGlassMaterial';
import { createHomeDashboardLiveCryptoBubbleDefaultRuntimeProductConfiguration } from '../src/app/homeDashboardLiveCryptoBubbleRuntimeProductPolicy';
import { createMarketMovesReader } from '../src/application/markets/marketMoves';
import type { DecimalString } from '../src/domain/trades';
import type { MarketCandleHistoryPort } from '../src/services/market-data/MarketCandleHistoryPort';
import type { MarketMovesPort, MarketMovesResult } from '../src/services/market-data/MarketMovesPort';
import { glassTestModel } from './fixtures/homeDashboardGlassModel';
import { stubGlassImage } from './fixtures/glassImageStub';

// T-061e: Live Market's runtime with a fixed model (its live hook is the one part replaced).
const liveModel = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../src/app/useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel', () => ({
  useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel: () => liveModel.current,
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('approved glass material', () => {
  it('removes black without a black rectangle and reconstructs source RGB on black', () => {
    const original = new Uint8ClampedArray([0,0,0,255, 12,91,210,255, 255,255,255,255, 0,0,0,0]);
    const pixels = original.slice(); removeGlassBlackMatte(pixels);
    expect([...pixels.slice(0,4)]).toEqual([0,0,0,0]);
    for(let i=4;i<12;i+=4) for(let c=0;c<3;c++) expect(Math.abs(pixels[i+c]*pixels[i+3]/255-original[i+c])).toBeLessThanOrEqual(1);
    // The formerly black pixel composites to any background exactly.
    for(const background of [12,128,240]) expect(pixels[0]*pixels[3]/255+background*(1-pixels[3]/255)).toBe(background);
  });
  it('rejects incomplete RGBA and preserves fully transparent pixels', () => {
    expect(() => removeGlassBlackMatte(new Uint8ClampedArray(3))).toThrow();
    const p=new Uint8ClampedArray([255,22,6,0]);removeGlassBlackMatte(p);expect([...p]).toEqual([0,0,0,0]);
  });
});

describe('scattered presentation layout', () => {
  it('keeps supplied radii, stable order and enough separation for hover at mobile and desktop widths', () => {
    for(const width of [296,366,728,980]) for(const count of [8,30]) {
      const input=Array.from({length:count},(_,i)=>({key:`coin${i}`,radius:48+((count-i)/count)*Math.min(55,width*.1)}));
      const snapshot=JSON.stringify(input),p=layoutGlassCircles(input,width);
      expect(p).toEqual(layoutGlassCircles(input,width));expect(JSON.stringify(input)).toBe(snapshot);expect(p.circles).toHaveLength(count);
      p.circles.forEach((a,i)=>{expect(a.radius).toBe(input[i].radius);expect(a.x-a.radius).toBeGreaterThanOrEqual(12);expect(a.x+a.radius).toBeLessThanOrEqual(width-12+.001);expect(a.y+a.radius).toBeLessThanOrEqual(p.height);p.circles.slice(i+1).forEach(b=>expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeGreaterThanOrEqual(a.radius+b.radius+24-.001))});
      expect(new Set(p.circles.map(x=>Math.round(x.x))).size).toBeGreaterThan(3);
    }
  });
  it('does not invent geometry for invalid or hidden bounds', () => {
    for(const width of [0,-1,NaN,Infinity,50]) expect(layoutGlassCircles([{key:'x',radius:48}],width).circles).toEqual([]);
  });
});

describe('glass map truth and controls', () => {
  it('shows readable movement and freshness without acquiring or mutating facts', () => {
    vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(366);
    const model=glassTestModel();const before=JSON.stringify(model);const {container}=render(<HomeDashboardGlassBubbleMap model={model}/>);
    expect(container.querySelectorAll('.kairos-glass-bubble')).toHaveLength(8);expect(screen.getAllByText('+2.1%')).toHaveLength(4);expect(screen.getAllByText('-1.3%')).toHaveLength(4);expect(JSON.stringify(model)).toBe(before);
    // T-061e (D271): each bubble is a button that says what it shows.
    expect(screen.getAllByRole('button', { name: /in 24 hours\. Show details$/ })).toHaveLength(8);
    expect(container.querySelector('section')).toHaveAttribute('data-motion','running');
    // A fresh bubble says nothing about its age.
    expect(container.querySelector('.kairos-glass-ago')).toBeNull();
    vi.spyOn(document,'hidden','get').mockReturnValue(true);act(()=>document.dispatchEvent(new Event('visibilitychange')));expect(container.querySelector('section')).toHaveAttribute('data-motion','paused');
  });
  it('labels stale facts and does not present expired movement as current', () => {
    vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(366);
    const model=glassTestModel(2);if(!model.radiusScaleProjection?.ok) throw Error('fixture');
    const p=model.radiusScaleProjection.entries;
    // T-061e: a stale or expired bubble says how old its price is ("2 min ago"), not a raw freshness word.
    Object.assign(p[0].areaWeightEntry.presentationEntry,{freshnessState:'stale'});
    Object.assign(p[0].areaWeightEntry.presentationEntry.metricInput,{ageMs:30_000});
    Object.assign(p[1].areaWeightEntry.presentationEntry,{freshnessState:'expired'});
    Object.assign(p[1].areaWeightEntry.presentationEntry.metricInput,{ageMs:150_000});
    const {container}=render(<HomeDashboardGlassBubbleMap model={model}/>);
    expect(screen.getByText('30 s ago')).toBeInTheDocument();expect(screen.getByText('2 min ago')).toBeInTheDocument();expect(screen.queryByText('stale')).toBeNull();expect(screen.queryByText('expired')).toBeNull();
    expect(screen.queryByText('-1.3%')).not.toBeInTheDocument();expect(screen.getByText('Unavailable')).toBeInTheDocument();expect(container.querySelector('[data-freshness="stale"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'BTC, up 2.1% in 24 hours, price 30 s ago. Show details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ETH, 24-hour move not available, price 2 min ago. Show details' })).toBeInTheDocument();
  });
  it('keeps missing geometry missing, including collapsed containers and failed projections', () => {
    vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(0);
    const model=glassTestModel();const {container,rerender}=render(<HomeDashboardGlassBubbleMap model={model}/>);expect(container.querySelectorAll('.kairos-glass-bubble')).toHaveLength(0);
    rerender(<HomeDashboardGlassBubbleMap model={{...model,radiusScaleProjection:null}}/>);expect(screen.getByText('Loading live prices…')).toBeInTheDocument();
  });
});


describe('market refresh identity continuity', () => {
  it('retains each instrument art and hover timing across a changed ranking while showing new facts immediately', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(366);
    // T-061a (D273): the art is the one shared glass image; a fresh module so the image loads in this test.
    stubGlassImage();
    vi.resetModules();
    const { HomeDashboardGlassBubbleMap } = await import('../src/app/HomeDashboardGlassBubbleMap');
    const first = glassTestModel(3);
    const { container, rerender } = render(<HomeDashboardGlassBubbleMap model={first} />);
    const find = (symbol: string) => [...container.querySelectorAll<HTMLElement>('.kairos-glass-bubble')].find(n => n.querySelector('strong')?.textContent === symbol)!;
    const original = find('BTC');
    await waitFor(() => expect(original.querySelector('.kairos-glass-art')).not.toBeNull());
    const art = original.querySelector('.kairos-glass-art');
    expect(art).toHaveAttribute('src', 'blob:kairos-glass');
    expect(container.querySelectorAll('.kairos-glass-art[src="blob:kairos-glass"]')).toHaveLength(3);
    const duration = original.style.getPropertyValue('--glass-duration'), delay = original.style.getPropertyValue('--glass-delay');
    const next = glassTestModel(3);
    if (!next.radiusScaleProjection?.ok) throw Error('fixture');
    const entries = next.radiusScaleProjection.entries;
    Object.assign(entries[0].areaWeightEntry.presentationEntry.metricInput, { movementPercent24h: '4.25' });
    Object.assign(next.radiusScaleProjection, { entries: [entries[1], entries[2], entries[0]] });
    const snapshot = JSON.stringify(next);
    rerender(<HomeDashboardGlassBubbleMap model={next} />);
    expect(find('BTC')).toBe(original);
    expect(find('BTC').querySelector('.kairos-glass-art')).toBe(art);
    expect(find('BTC').style.getPropertyValue('--glass-duration')).toBe(duration);
    expect(find('BTC').style.getPropertyValue('--glass-delay')).toBe(delay);
    expect(find('BTC')).toHaveTextContent('+4.3%');
    expect([...container.querySelectorAll('.kairos-glass-bubble strong')].map(n => n.textContent)).toEqual(['BTC', 'ETH', 'SOL']);
    expect(JSON.stringify(next)).toBe(snapshot);
    const grownWidth = parseFloat(find('BTC').style.width);
    rerender(<HomeDashboardGlassBubbleMap model={first} />);
    expect(container.querySelector('section')).toHaveAttribute('data-motion', 'running');
    expect(parseFloat(find('BTC').style.width)).toBeLessThan(grownWidth);
    expect(find('BTC').querySelector('.kairos-glass-art')).toBe(art);
  });
});


describe('percentage sizing amendment', () => {
  it('sizes by absolute percentage independently of volume, distinguishes extremes and keeps missing unavailable', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(366);
    const model = glassTestModel(8);
    if (!model.radiusScaleProjection?.ok) throw Error('fixture');
    const values = ['0', '5', '-5', '20', '200', null, '1', '10'];
    model.radiusScaleProjection.entries.forEach((e, i) => Object.assign(e.areaWeightEntry.presentationEntry.metricInput, { movementPercent24h: values[i] }));
    const snapshot = JSON.stringify(model);
    const {container} = render(<HomeDashboardGlassBubbleMap model={model}/>);
    const width = (symbol: string) => parseFloat([...container.querySelectorAll<HTMLElement>('.kairos-glass-bubble')].find(n => n.querySelector('strong')?.textContent === symbol)!.style.width);
    expect(width('ETH')).toBe(width('SOL'));
    expect(width('BTC')).toBeLessThan(width('LINK'));
    expect(width('LINK')).toBeLessThan(width('ETH'));
    expect(width('ETH')).toBeLessThan(width('SUI'));
    expect(width('BNB')).toBeLessThan(width('XRP'));
    expect(width('XRP') / width('BTC')).toBeGreaterThan(3);
    expect(container.querySelectorAll('.kairos-glass-bubble')).toHaveLength(7);
    expect(JSON.stringify(model)).toBe(snapshot);
  });
});


describe('T-061e (D271): tap a market bubble; size by 1 hour, 24 hours or 7 days', () => {
  const d = (value: string) => value as DecimalString;
  const moves = (window: '1h' | '7d'): MarketMovesResult => ({ ok: true, observedAt: new Date().toISOString(), moves: window === '1h'
    ? [{ symbol: 'BTCUSDT', open: d('100'), last: d('100.1') }, { symbol: 'ETHUSDT', open: d('100'), last: d('110') }, { symbol: 'SOLUSDT', open: d('100'), last: d('101') }]
    : [{ symbol: 'BTCUSDT', open: d('100'), last: d('80') }, { symbol: 'ETHUSDT', open: d('100'), last: d('101') }, { symbol: 'SOLUSDT', open: d('100'), last: d('100') }] });
  const BUSY: MarketMovesResult = { ok: false, reason: 'unavailable', why: 'busy', retryAfterSeconds: 60 };
  const history: MarketCandleHistoryPort = { acquireHistory: async request => ({ ok: true, snapshot: { source: 'market-reference', timeZone: 'UTC', request, observedAt: new Date().toISOString(), candles: [] } }) };
  const settle = async () => { await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }); };

  function liveMarket(acquireMoves: MarketMovesPort['acquireMoves'] = async ({ window }) => moves(window)) {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(366);
    const model = glassTestModel(3);
    if (!model.radiusScaleProjection?.ok) throw Error('fixture');
    for (const entry of model.radiusScaleProjection.entries) Object.assign(entry.areaWeightEntry.presentationEntry.metricInput, { fact: { lastPrice: '64210.5', observedAt: new Date(Date.now() - 40_000).toISOString() } });
    liveModel.current = model;
    const port = { acquireMoves: vi.fn(acquireMoves) };
    const reader = createMarketMovesReader({ moves: port, history, perMinute: null });
    const coinNames = { coinNames: vi.fn(async () => ({ ok: true as const, names: new Map([['BTC', 'Bitcoin']]) })) };
    const view = render(<HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime configuration={createHomeDashboardLiveCryptoBubbleDefaultRuntimeProductConfiguration()} market={{ reader, coinNames }} />);
    return { ...view, port: port.acquireMoves };
  }
  const bubble = (symbol: string) => screen.getByRole('button', { name: new RegExp(`^${symbol}, `) });
  const width = (symbol: string) => parseFloat(bubble(symbol).style.width);
  const periods = () => screen.getByRole('group', { name: 'Size by the move in' });

  it('names each bubble button with the coin, its name when known, its move and the period, and says how old the prices are', async () => {
    const { container } = liveMarket();
    expect(await screen.findByRole('button', { name: 'BTC, Bitcoin, up 2.1% in 24 hours. Show details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ETH, down 1.3% in 24 hours. Show details' })).toBeInTheDocument();
    expect(container.querySelector('.kairos-glass-bubble[title]')).toBeNull();
    expect(container.querySelector('.kairos-glass-sr')).toBeNull();
    expect(screen.getByText('Prices updated 40 s ago')).toBeInTheDocument();
    expect(within(periods()).getByRole('button', { name: '24 hours' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('24h · size by % move')).toBeNull();
  });

  it('opens the sheet with Enter (a click with no pointer) or a tap, and gives the focus back to that bubble on close, even when the tap did not focus it', async () => {
    liveMarket();
    const btc = await screen.findByRole('button', { name: /^BTC, Bitcoin, / });
    btc.focus();
    // A browser turns Enter on a focused button into a click with detail 0.
    fireEvent.click(btc, { detail: 0 });
    const sheet = await screen.findByRole('dialog', { name: 'BTC · Bitcoin' });
    expect(within(sheet).getByText('Price 64210.5 USDT')).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Open chart' })).toHaveAttribute('href', '/analysis?market=binance-spot%3ABTCUSDT');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    await settle();
    expect(document.activeElement).toBe(btc);
    // Safari: a tap opens the sheet without focusing the button; focus still comes back to it.
    (document.activeElement as HTMLElement).blur();
    const eth = bubble('ETH');
    fireEvent.click(eth, { detail: 1 });
    const ethSheet = await screen.findByRole('dialog', { name: 'ETH' });
    fireEvent.keyDown(ethSheet, { key: 'Escape' });
    await settle();
    expect(document.activeElement).toBe(eth);
  });

  it('a drag never opens the sheet; the bubbles keep their identity', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
    liveMarket();
    await settle();
    const btc = bubble('BTC');
    const pointer = (target: EventTarget, type: string, x: number, y: number) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y });
      Object.assign(event, { pointerType: 'mouse', pointerId: 1, isPrimary: true });
      act(() => { target.dispatchEvent(event); });
    };
    pointer(btc, 'pointerdown', 80, 100);
    act(() => { vi.advanceTimersByTime(GLASS_HOLD_MS); });
    pointer(window, 'pointermove', 140, 160);
    pointer(window, 'pointerup', 140, 160);
    fireEvent.click(btc, { detail: 1 });
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(bubble('BTC')).toBe(btc);
  });

  it('"1 hour" and "7 days" size and label the bubbles by that move; "24 hours" brings the 24-hour sizes back', async () => {
    const { port } = liveMarket();
    await screen.findByRole('button', { name: /^BTC, Bitcoin, / });
    const day = { BTC: width('BTC'), ETH: width('ETH'), SOL: width('SOL') };
    expect(day.BTC).toBe(day.SOL);
    expect(day.ETH).toBeLessThan(day.BTC);
    fireEvent.click(within(periods()).getByRole('button', { name: '1 hour' }));
    await settle();
    expect(port.mock.calls.map(([request]) => `${request.window} ${request.symbols.join(',')}`)).toEqual(['1h BTCUSDT,ETHUSDT,SOLUSDT']);
    expect(within(periods()).getByRole('button', { name: '1 hour' })).toHaveAttribute('aria-pressed', 'true');
    expect(bubble('ETH')).toHaveAccessibleName('ETH, up 10% in 1 hour. Show details');
    expect(bubble('ETH')).toHaveTextContent('+10.0%');
    expect(width('ETH')).toBeGreaterThan(width('SOL'));
    expect(width('SOL')).toBeGreaterThan(width('BTC'));
    fireEvent.click(within(periods()).getByRole('button', { name: '7 days' }));
    await settle();
    expect(bubble('BTC')).toHaveAccessibleName('BTC, Bitcoin, down 20% in 7 days. Show details');
    expect(bubble('BTC')).toHaveAttribute('data-movement', 'negative');
    expect(width('BTC')).toBeGreaterThan(width('ETH'));
    fireEvent.click(within(periods()).getByRole('button', { name: '24 hours' }));
    await settle();
    expect({ BTC: width('BTC'), ETH: width('ETH'), SOL: width('SOL') }).toEqual(day);
    expect(bubble('BTC')).toHaveAccessibleName('BTC, Bitcoin, up 2.1% in 24 hours. Show details');
    // 24 hours comes with the prices: no request.
    expect(port).toHaveBeenCalledTimes(2);
  });

  it('when the 7-day moves fail, it falls back to 24 hours, says so, and "Try again" asks once more', async () => {
    const { port } = liveMarket(async ({ window }) => (window === '7d' ? BUSY : moves(window)));
    await screen.findByRole('button', { name: /^BTC, Bitcoin, / });
    const day = width('BTC');
    const week = within(periods()).getByRole('button', { name: '7 days' });
    week.focus();
    fireEvent.click(week);
    await settle();
    expect(screen.getByText('7-day moves are unavailable right now.')).toBeInTheDocument();
    expect(within(periods()).getByRole('button', { name: '24 hours' })).toHaveAttribute('aria-pressed', 'true');
    expect(bubble('BTC')).toHaveAccessibleName('BTC, Bitcoin, up 2.1% in 24 hours. Show details');
    expect(width('BTC')).toBe(day);
    expect(document.activeElement).toBe(week);
    port.mockImplementation(async ({ window }) => moves(window));
    const retry = screen.getByRole('button', { name: 'Try again' });
    retry.focus();
    fireEvent.click(retry);
    await settle();
    expect(port).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('7-day moves are unavailable right now.')).toBeNull();
    expect(within(periods()).getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(bubble('BTC')).toHaveAccessibleName('BTC, Bitcoin, down 20% in 7 days. Show details');
    // "Try again" went away with the answer: the switch holds the focus, never the page.
    expect(document.activeElement).toBe(within(periods()).getByRole('button', { name: '7 days' }));
  });
});
