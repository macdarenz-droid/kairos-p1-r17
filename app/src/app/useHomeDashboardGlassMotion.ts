import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { GlassCircle } from './homeDashboardGlassLayout';
import { createGlassBody, limitGlassVelocity, stepGlassBodies, type GlassBody, type GlassDrag } from './homeDashboardGlassMotion';
import { bindHomeDashboardGlassDrag } from './homeDashboardGlassDrag';

type MotionState = {
  bodies: Map<string, GlassBody>; origins: Map<string, GlassCircle>;
  width: number; height: number; hidden: boolean; drag: GlassDrag | null; inputAt: number;
};

/** One presentation runtime owns translation and direct manipulation. React owns identities/facts/sizing. */
export function useHomeDashboardGlassMotion(container: RefObject<HTMLDivElement | null>, circles: readonly GlassCircle[], width: number, height: number, hidden: boolean) {
  const runtime = useRef<MotionState>({ bodies: new Map(), origins: new Map(), width: 0, height: 0, hidden: true, drag: null, inputAt: 0 });
  const synchronize = useRef<((resized: boolean) => void) | null>(null);
  useLayoutEffect(() => {
    const state = runtime.current;
    const resized = state.width !== width || state.height !== height;
    state.bodies = new Map(circles.map(c => {
      const body = state.bodies.get(c.key) ?? createGlassBody(c);
      body.radius = c.radius;
      return [c.key, body];
    }));
    state.origins = new Map(circles.map(c => [c.key, c]));
    state.width = width; state.height = height; state.hidden = hidden;
    synchronize.current?.(resized);
  }, [circles, width, height, hidden]);

  useLayoutEffect(() => {
    const field = container.current;
    if (!field || typeof window.matchMedia !== 'function' || typeof requestAnimationFrame !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let nodes = new Map<string, HTMLElement>(), frame = 0, last = 0;
    const enabled = () => !runtime.current.hidden && !document.hidden;
    const collect = () => {
      nodes = new Map(Array.from(field.querySelectorAll<HTMLElement>('[data-glass-key]')).map(node => [node.dataset.glassKey!, node]));
    };
    const draw = () => {
      const state = runtime.current;
      for (const body of state.bodies.values()) {
        const node = nodes.get(body.key), origin = state.origins.get(body.key);
        if (node && origin) node.style.translate = `${body.x - origin.x}px ${body.y - origin.y}px`;
      }
    };
    const step = (seconds: number) => {
      const state = runtime.current;
      // Read interpolated growth before writing any translations; financial radii remain React-owned.
      for (const body of state.bodies.values()) {
        const origin = state.origins.get(body.key)!;
        body.radius = Math.max(origin.radius, (nodes.get(body.key)?.getBoundingClientRect().width ?? 0) / 2);
      }
      const drag = state.drag && performance.now() - state.inputAt > 80 ? { ...state.drag, vx: 0, vy: 0 } : state.drag;
      stepGlassBodies([...state.bodies.values()], state.width, state.height, seconds, drag, media.matches);
      draw();
    };
    const tick = (time: number) => {
      frame = 0;
      if (!enabled() || media.matches) return;
      step(last ? (time - last) / 1000 : 0); last = time;
      frame = requestAnimationFrame(tick);
    };
    const schedule = () => {
      cancelAnimationFrame(frame); frame = 0; last = 0;
      if (enabled() && !media.matches) frame = requestAnimationFrame(tick);
    };
    const input = bindHomeDashboardGlassDrag(field, {
      body: key => runtime.current.bodies.get(key),
      bounds: () => runtime.current,
      enabled,
      move: drag => {
        runtime.current.drag = drag; runtime.current.inputAt = performance.now();
        step(0);
      },
      end: (key, vx, vy) => {
        const state = runtime.current, body = state.bodies.get(key);
        state.drag = null;
        if (body) {
          const ambient = createGlassBody(body);
          Object.assign(body, media.matches ? { vx: 0, vy: 0 } : Math.hypot(vx, vy) < 12 ? { vx: ambient.vx, vy: ambient.vy } : { vx, vy });
          limitGlassVelocity(body);
        }
        step(0);
      },
    });
    const sync = (resized: boolean) => {
      collect();
      const key = input.activeKey();
      if (resized || !enabled() || (key !== null && !runtime.current.bodies.has(key))) input.cancel();
      // A static reduced-motion view cannot rely on later frames to settle a resized/repopulated layout.
      // Preserve the released packed layout on refresh unless the user is currently manipulating it.
      if (media.matches && input.activeKey() === null) {
        for (const body of runtime.current.bodies.values()) Object.assign(body, runtime.current.origins.get(body.key), { vx: 0, vy: 0 });
      }
      step(0); schedule();
    };
    const visibility = () => { if (!enabled()) input.cancel(); schedule(); };
    const motionPreference = () => {
      input.cancel();
      for (const body of runtime.current.bodies.values()) {
        const origin = runtime.current.origins.get(body.key)!;
        if (media.matches) Object.assign(body, origin, { vx: 0, vy: 0 });
        else { const ambient = createGlassBody(body); body.vx = ambient.vx; body.vy = ambient.vy; }
      }
      step(0); schedule();
    };
    synchronize.current = sync;
    collect(); motionPreference();
    media.addEventListener('change', motionPreference);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      synchronize.current = null;
      cancelAnimationFrame(frame);
      input.dispose();
      media.removeEventListener('change', motionPreference);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [container]);
}
