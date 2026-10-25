import {describe,it,expect} from 'vitest';
import {createGlassBody,stepGlassBodies} from '../src/app/homeDashboardGlassMotion';
import {glassMovementWeight,layoutGlassViewportCircles} from '../src/app/homeDashboardGlassViewportLayout';

describe('free drifting bubble presentation',()=>{
 it('exchanges approach velocity and bounces from walls',()=>{
   const a={key:'a',x:80,y:100,radius:28,vx:18,vy:0},b={key:'b',x:145,y:100,radius:28,vx:-18,vy:0};
   stepGlassBodies([a,b],300,300,.016);expect(a.vx).toBeLessThan(0);expect(b.vx).toBeGreaterThan(0);
   a.x=32;a.vx=-18;stepGlassBodies([a],300,300,.016);expect(a.x).toBeGreaterThanOrEqual(33);expect(a.vx).toBeGreaterThan(0);
 });
 it('keeps 30 independently drifting bodies bounded and separated over 30 seconds',()=>{
   const input=Array.from({length:30},(_,i)=>({key:`coin${i}`,radius:glassMovementWeight(i===0?10:(i%10)*.3,10)}));
   const layout=layoutGlassViewportCircles(input,396,650),bodies=layout.circles.map(createGlassBody),start=bodies.map(b=>({...b}));
   for(let t=0;t<1800;t++){
     stepGlassBodies(bodies,396,650,1/60);
     if(t%60===0)bodies.forEach((a,i)=>{expect(a.x-a.radius).toBeGreaterThanOrEqual(4.99);expect(a.y-a.radius).toBeGreaterThanOrEqual(4.99);expect(a.x+a.radius).toBeLessThanOrEqual(391.01);expect(a.y+a.radius).toBeLessThanOrEqual(645.01);bodies.slice(i+1).forEach(b=>expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeGreaterThanOrEqual(a.radius+b.radius+9.8));});
   }
   expect(bodies.filter((b,i)=>Math.hypot(b.x-start[i].x,b.y-start[i].y)>15).length).toBeGreaterThan(20);
 });
});
