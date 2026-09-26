import type { GlassCircle } from './homeDashboardGlassLayout';

export type GlassBody = { -readonly [K in keyof GlassCircle]: GlassCircle[K] } & { vx: number; vy: number };
export type GlassDrag = { readonly key: string; readonly x: number; readonly y: number; readonly vx: number; readonly vy: number };
export const GLASS_MAX_SPEED = 480;
export function limitGlassVelocity(body: { vx: number; vy: number }, maximum = GLASS_MAX_SPEED): void {
  const speed = Math.hypot(body.vx, body.vy);
  if (speed > maximum) { body.vx *= maximum / speed; body.vy *= maximum / speed; }
}
export function constrainGlassPoint(x: number, y: number, radius: number, width: number, height: number) {
  const lo = radius + 5;
  return { x: Math.max(lo, Math.min(x, Math.max(lo, width - lo))), y: Math.max(lo, Math.min(y, Math.max(lo, height - lo))) };
}
export function createGlassBody(circle: GlassCircle): GlassBody {
  let hash=2166136261;
  for(const c of circle.key) hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
  const angle=(hash%6283)/1000, speed=12+(hash%9);
  return {...circle,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed};
}

/** Mutable presentation bodies only; fixed bounded substeps prevent resume jumps.
 * Elastic impulses exchange velocity; positional relaxation also handles live growth.
 */
export function stepGlassBodies(bodies: GlassBody[], width: number, height: number, seconds: number, drag: GlassDrag | null = null, reducedMotion = false): void {
  const held = drag ? bodies.find(b => b.key === drag.key) : undefined;
  const target = held && drag ? constrainGlassPoint(drag.x, drag.y, held.radius, width, height) : null;
  const start = held ? { x: held.x, y: held.y } : null;
  // Sweep the grabbed body through intermediate positions so quick finger movement cannot skip neighbours.
  const steps = target && start ? Math.max(2, Math.min(64, Math.ceil(Math.hypot(target.x - start.x, target.y - start.y) / 8))) : 2;
  const dt = reducedMotion ? 0 : Math.max(0, Math.min(seconds, .032)) / steps;
  const walls=(b:GlassBody)=>{
    const lo=b.radius+5, right=Math.max(lo,width-lo), bottom=Math.max(lo,height-lo);
    if(b.x<lo){b.x=lo;b.vx=Math.abs(b.vx);}if(b.x>right){b.x=right;b.vx=-Math.abs(b.vx);}
    if(b.y<lo){b.y=lo;b.vy=Math.abs(b.vy);}if(b.y>bottom){b.y=bottom;b.vy=-Math.abs(b.vy);}
  };
  for(let sub=0;sub<steps;sub++) {
    for(const b of bodies){
      if (b === held && target && start && drag) {
        b.x = start.x + (target.x - start.x) * (sub + 1) / steps;
        b.y = start.y + (target.y - start.y) * (sub + 1) / steps;
        b.vx = reducedMotion ? 0 : drag.vx; b.vy = reducedMotion ? 0 : drag.vy;
      } else { b.x+=b.vx*dt;b.y+=b.vy*dt; }
      limitGlassVelocity(b); walls(b);
    }
    for(let pass=0;pass<12;pass++) {
      for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++) {
        const a=bodies[i],b=bodies[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),limit=a.radius+b.radius+10;
        if(d>=limit)continue;
        const nx=d>1e-8?dx/d:1,ny=d>1e-8?dy/d:0;
        const ia=a===held?0:1/(a.radius*a.radius),ib=b===held?0:1/(b.radius*b.radius),sum=ia+ib;
        const shift=limit-d+.001;
        a.x-=nx*shift*ia/sum;a.y-=ny*shift*ia/sum;b.x+=nx*shift*ib/sum;b.y+=ny*shift*ib/sum;
        const closing=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
        if(closing<0&&!reducedMotion){const impulse=-2*closing/sum;a.vx-=impulse*ia*nx;a.vy-=impulse*ia*ny;b.vx+=impulse*ib*nx;b.vy+=impulse*ib*ny;}
      }
      for(const b of bodies)walls(b);
    }
    for(const b of bodies){
      if (reducedMotion) { b.vx=0;b.vy=0;continue; }
      limitGlassVelocity(b);
      const speed=Math.hypot(b.vx,b.vy);
      // Only excess gesture/collision energy decays; the released ambient drift remains continuous.
      if(b!==held&&speed>26){const next=26+(speed-26)*Math.exp(-3*dt);b.vx*=next/speed;b.vy*=next/speed;}
    }
  }
}
