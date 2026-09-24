import { layoutGlassCircles, type GlassCircle, type GlassCircleInput } from './homeDashboardGlassLayout';

/** Presentation-only relative scale. Equal gain/loss magnitudes share a size. */
export function glassMovementWeight(magnitude: number, maximum: number): number {
  return .24 + .76 * Math.pow(maximum > 0 ? Math.min(magnitude / maximum, 1) : 0, .7);
}

/** Fit every supplied circle into measured bounds; never select or drop markets.
 * Largest-first packing is geometry only; provider rank and DOM identity are untouched.
 */
export function layoutGlassViewportCircles(inputs: readonly GlassCircleInput[], width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 140 || height < 140 ||
      inputs.some(x => !Number.isFinite(x.radius) || x.radius <= 0)) return { circles: [] as GlassCircle[], height: 0 };
  if (!inputs.length) return { circles: [] as GlassCircle[], height };
  const sorted = [...inputs].sort((a,b) => b.radius-a.radius || (a.key < b.key ? -1 : 1));
  const gap = 10, edge = 5;
  const pack = (scale: number, attempt: number): GlassCircle[] | null => {
    let seed = 43129 + attempt * 7919;
    const random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
    const circles: GlassCircle[] = [];
    for (const item of sorted) {
      const radius = Math.max(28, item.radius * scale), extent = radius + edge;
      if (extent*2 > width || extent*2 > height) return null;
      let best: GlassCircle | null = null, score=Infinity;
      const targetX=random()*width, targetY=circles.length===0?height*.5:circles.length%2?0:height;
      for (let i=0;i<1400;i++) {
        const x=extent+random()*(width-extent*2), y=extent+random()*(height-extent*2);
        if (circles.some(c => Math.hypot(x-c.x,y-c.y) < radius+c.radius+gap)) continue;
        const candidateScore=Math.hypot(x-targetX,y-targetY);
        if(candidateScore<score){score=candidateScore;best={key:item.key,radius,x,y};}
      }
      if (!best) return null;
      circles.push(best);
    }
    return circles;
  };
  let scale=Math.min(155,Math.sqrt(width*height*.68/(Math.PI*inputs.reduce((s,c)=>s+c.radius*c.radius,0))));
  for (let attempt=0;attempt<60;attempt++,scale*=.94) {
    const circles=pack(scale,attempt);
    if (circles) {
      return {circles,height};
    }
    if(scale<=28) break;
  }
  // Very short/zoomed viewports retain readable markets via the released scroll layout.
  return layoutGlassCircles(inputs.map(x=>({...x,radius:Math.max(28,x.radius*Math.min(100,(width-24)/2))})),width);
}
