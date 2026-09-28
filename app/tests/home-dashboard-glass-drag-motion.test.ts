import { describe, expect, it } from 'vitest';
import { createGlassBody, GLASS_MAX_SPEED, stepGlassBodies } from '../src/app/homeDashboardGlassMotion';
import { glassMovementWeight, layoutGlassViewportCircles } from '../src/app/homeDashboardGlassViewportLayout';

describe('directly manipulated bubble physics', () => {
  it('sweeps a pinned bubble through neighbours and transfers bounded momentum', () => {
    const a = { key: 'a', x: 65, y: 100, radius: 24, vx: 0, vy: 0 };
    const b = { key: 'b', x: 145, y: 100, radius: 24, vx: 0, vy: 0 };
    const c = { key: 'c', x: 225, y: 100, radius: 24, vx: 0, vy: 0 };
    stepGlassBodies([a, b, c], 500, 300, .016, { key: 'a', x: 200, y: 100, vx: 400, vy: 0 });
    expect(a.x).toBe(200); expect(a.y).toBe(100);
    expect(b.x).toBeGreaterThanOrEqual(257.99); expect(c.x - b.x).toBeGreaterThanOrEqual(57.9);
    expect(b.vx).toBeGreaterThan(26); expect(c.vx).toBeGreaterThan(26);
    for (const body of [a, b, c]) expect(Math.hypot(body.vx, body.vy)).toBeLessThanOrEqual(GLASS_MAX_SPEED + .001);
  });
  it('clamps held positions at the field edges and damps a fling back to ambient motion', () => {
    const a = createGlassBody({ key: 'a', x: 140, y: 140, radius: 24 });
    stepGlassBodies([a], 320, 400, .016, { key: 'a', x: -900, y: 1200, vx: -9000, vy: 9000 });
    expect(a.x).toBe(29); expect(a.y).toBe(371);
    a.vx = 480; a.vy = 0;
    for (let i = 0; i < 360; i++) stepGlassBodies([a], 320, 400, 1 / 60);
    expect(Math.hypot(a.vx, a.vy)).toBeGreaterThan(25);
    expect(Math.hypot(a.vx, a.vy)).toBeLessThan(26.01);
    expect(a.x).toBeGreaterThanOrEqual(29); expect(a.x).toBeLessThanOrEqual(291);
  });
  it('supports intentional movement with reduced motion and leaves no release animation', () => {
    const a = createGlassBody({ key: 'a', x: 65, y: 100, radius: 24 });
    const b = createGlassBody({ key: 'b', x: 145, y: 100, radius: 24 });
    stepGlassBodies([a, b], 400, 300, .016, { key: 'a', x: 150, y: 100, vx: 480, vy: 0 }, true);
    expect(a.x).toBe(150); expect(b.x).toBeGreaterThanOrEqual(208);
    const snapshot = JSON.stringify([a, b]);
    for (let i = 0; i < 60; i++) stepGlassBodies([a, b], 400, 300, .016, null, true);
    expect(JSON.stringify([a, b])).toBe(snapshot);
    expect([a.vx, a.vy, b.vx, b.vy]).toEqual([0, 0, 0, 0]);
  });
  it('keeps all 30 phone bubbles bounded through repeated cross-field drags and release', () => {
    const circles = layoutGlassViewportCircles(Array.from({ length: 30 }, (_, i) => ({ key: `coin${i}`, radius: glassMovementWeight(i === 0 ? 10 : (i % 10) * .3, 10) })), 296, 570).circles;
    const original = JSON.stringify(circles), bodies = circles.map(createGlassBody);
    for (let frame = 0; frame < 240; frame++) {
      const p = frame / 239;
      stepGlassBodies(bodies, 296, 570, 1 / 60, { key: 'coin0', x: 40 + 210 * p, y: 80 + 400 * p, vx: 120, vy: 220 });
      for (const body of bodies) {
        expect(body.x - body.radius).toBeGreaterThanOrEqual(4.99);
        expect(body.y - body.radius).toBeGreaterThanOrEqual(4.99);
        expect(body.x + body.radius).toBeLessThanOrEqual(291.01);
        expect(body.y + body.radius).toBeLessThanOrEqual(565.01);
        expect(Number.isFinite(body.x + body.y + body.vx + body.vy)).toBe(true);
      }
    }
    for (let frame = 0; frame < 360; frame++) stepGlassBodies(bodies, 296, 570, 1 / 60);
    bodies.forEach((a, i) => bodies.slice(i + 1).forEach(b => expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.radius + b.radius + 9.7)));
    expect(JSON.stringify(circles)).toBe(original);
    expect(bodies.map(b => b.key)).toEqual(circles.map(b => b.key));
  });
});
