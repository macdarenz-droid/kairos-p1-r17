import { act, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeDashboardGlassBubbleMap } from '../src/app/HomeDashboardGlassBubbleMap';
import { layoutGlassCircles } from '../src/app/homeDashboardGlassLayout';
import { removeGlassBlackMatte } from '../src/app/homeDashboardGlassMaterial';
import { glassTestModel } from './fixtures/homeDashboardGlassModel';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

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
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelector('section')).toHaveAttribute('data-motion','running');
    expect(container.querySelector('small')).not.toBeVisible();
    vi.spyOn(document,'hidden','get').mockReturnValue(true);act(()=>document.dispatchEvent(new Event('visibilitychange')));expect(container.querySelector('section')).toHaveAttribute('data-motion','paused');
  });
  it('labels stale facts and does not present expired movement as current', () => {
    vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(366);
    const model=glassTestModel(2);if(!model.radiusScaleProjection?.ok) throw Error('fixture');
    const p=model.radiusScaleProjection.entries;
    Object.assign(p[0].areaWeightEntry.presentationEntry,{freshnessState:'stale'});
    Object.assign(p[1].areaWeightEntry.presentationEntry,{freshnessState:'expired'});
    const {container}=render(<HomeDashboardGlassBubbleMap model={model}/>);
    expect(screen.getByText('stale')).toBeInTheDocument();expect(screen.getByText('expired')).toBeInTheDocument();expect(screen.queryByText('-1.3%')).not.toBeInTheDocument();expect(screen.getByText('Unavailable')).toBeInTheDocument();expect(container.querySelector('[data-freshness="stale"]')).toBeInTheDocument();
  });
  it('keeps missing geometry missing, including collapsed containers and failed projections', () => {
    vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(0);
    const model=glassTestModel();const {container,rerender}=render(<HomeDashboardGlassBubbleMap model={model}/>);expect(container.querySelectorAll('.kairos-glass-bubble')).toHaveLength(0);
    rerender(<HomeDashboardGlassBubbleMap model={{...model,radiusScaleProjection:null}}/>);expect(screen.getByText('Loading live prices…')).toBeInTheDocument();
  });
});


describe('market refresh identity continuity', () => {
  it('retains each instrument canvas and hover timing across a changed ranking while showing new facts immediately', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(366);
    const first = glassTestModel(3);
    const { container, rerender } = render(<HomeDashboardGlassBubbleMap model={first} />);
    const find = (symbol: string) => [...container.querySelectorAll<HTMLElement>('.kairos-glass-bubble')].find(n => n.querySelector('strong')?.textContent === symbol)!;
    const original = find('BTC'), canvas = original.querySelector('canvas');
    const duration = original.style.getPropertyValue('--glass-duration'), delay = original.style.getPropertyValue('--glass-delay');
    const next = glassTestModel(3);
    if (!next.radiusScaleProjection?.ok) throw Error('fixture');
    const entries = next.radiusScaleProjection.entries;
    Object.assign(entries[0].areaWeightEntry.presentationEntry.metricInput, { movementPercent24h: '4.25' });
    Object.assign(next.radiusScaleProjection, { entries: [entries[1], entries[2], entries[0]] });
    const snapshot = JSON.stringify(next);
    rerender(<HomeDashboardGlassBubbleMap model={next} />);
    expect(find('BTC')).toBe(original);
    expect(find('BTC').querySelector('canvas')).toBe(canvas);
    expect(find('BTC').style.getPropertyValue('--glass-duration')).toBe(duration);
    expect(find('BTC').style.getPropertyValue('--glass-delay')).toBe(delay);
    expect(find('BTC')).toHaveTextContent('+4.3%');
    expect([...container.querySelectorAll('.kairos-glass-bubble strong')].map(n => n.textContent)).toEqual(['BTC', 'ETH', 'SOL']);
    expect(JSON.stringify(next)).toBe(snapshot);
    const grownWidth = parseFloat(find('BTC').style.width);
    rerender(<HomeDashboardGlassBubbleMap model={first} />);
    expect(container.querySelector('section')).toHaveAttribute('data-motion', 'running');
    expect(parseFloat(find('BTC').style.width)).toBeLessThan(grownWidth);
    expect(find('BTC').querySelector('canvas')).toBe(canvas);
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
