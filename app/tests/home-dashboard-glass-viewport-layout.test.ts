import {describe,it,expect} from 'vitest';
import {glassMovementWeight,layoutGlassViewportCircles} from '../src/app/homeDashboardGlassViewportLayout';

describe('compact percentage packing',()=>{
  it('retains every instrument, wide size contrast, bounds and motion clearance on phone/tablet/desktop',()=>{
    for(const [width,height] of [[344,570],[396,650],[860,720]]) {
      const input=Array.from({length:30},(_,i)=>({key:`coin${i}`,radius:glassMovementWeight(i===0?10:(i%10)*.3,10)}));
      const before=JSON.stringify(input),p=layoutGlassViewportCircles(input,width,height);
      expect(p.circles).toHaveLength(30);expect(p.height).toBe(height);expect(JSON.stringify(input)).toBe(before);
      expect(Math.max(...p.circles.map(c=>c.radius))/Math.min(...p.circles.map(c=>c.radius))).toBeGreaterThan(2);
      p.circles.forEach((a,i)=>{expect(a.x-a.radius).toBeGreaterThanOrEqual(5);expect(a.x+a.radius).toBeLessThanOrEqual(width-5);expect(a.y-a.radius).toBeGreaterThanOrEqual(5);expect(a.y+a.radius).toBeLessThanOrEqual(height-5+.001);p.circles.slice(i+1).forEach(b=>expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeGreaterThanOrEqual(a.radius+b.radius+10-.001));});
    }
  });
  it('keeps equal/zero moves equal, never mutates order, and rejects invalid geometry',()=>{
    const input=Array.from({length:30},(_,i)=>({key:`coin${i}`,radius:glassMovementWeight(0,0)}));
    const p=layoutGlassViewportCircles(input,344,570);
    expect(p.circles).toHaveLength(30);expect(new Set(p.circles.map(c=>c.radius)).size).toBe(1);
    expect(layoutGlassViewportCircles(input,344,240).circles).toHaveLength(30);
    for(const w of [0,NaN,Infinity,-1])expect(layoutGlassViewportCircles(input,w,570).circles).toEqual([]);
  });
});
