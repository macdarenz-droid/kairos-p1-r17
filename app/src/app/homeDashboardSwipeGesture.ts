/** Pure Home pager swipe recognition. No DOM, no timers, no market or trade ownership. */
export type HomeDashboardView = 'market' | 'trades';
export type HomeSwipeAxis = 'pending' | 'horizontal' | 'vertical' | 'cancelled';
export type HomeSwipeDirection = 'next' | 'previous';

export interface HomeSwipePolicy {
  /** Movement (CSS pixels) before the gesture commits to an axis. */
  readonly slop: number;
  /** Horizontal travel must exceed vertical travel by this factor to own the gesture. */
  readonly ratio: number;
  /** Horizontal travel that pages regardless of speed. */
  readonly distance: number;
  /** Release speed (CSS pixels per millisecond) that pages before the distance is reached. */
  readonly velocity: number;
  /** Visual travel cap while the finger drags a single mounted pane. */
  readonly limit: number;
}

export const HOME_SWIPE_POLICY: HomeSwipePolicy = Object.freeze({ slop: 10, ratio: 1.4, distance: 64, velocity: 0.5, limit: 96 });

export interface HomeSwipeSample { readonly x: number; readonly y: number; readonly time: number }
export interface HomeSwipeState { readonly axis: HomeSwipeAxis; readonly dx: number; readonly dy: number; readonly offset: number }
export interface HomeSwipeDecision { readonly direction: HomeSwipeDirection | null; readonly dx: number; readonly velocity: number }

const IDLE: HomeSwipeState = Object.freeze({ axis: 'cancelled', dx: 0, dy: 0, offset: 0 });

/** Asymptotic finger follow: the pane never travels beyond `limit`. */
export function rubberBandOffset(dx: number, limit: number): number {
  if (!Number.isFinite(dx) || !Number.isFinite(limit) || limit <= 0) return 0;
  const magnitude = Math.abs(dx);
  return Math.sign(dx) * limit * (magnitude / (magnitude + limit));
}

export function nextHomeDashboardView(view: HomeDashboardView, direction: HomeSwipeDirection | null): HomeDashboardView | null {
  if (direction === 'next' && view === 'market') return 'trades';
  if (direction === 'previous' && view === 'trades') return 'market';
  return null;
}

export function createHomeSwipeRecognizer(policy: HomeSwipePolicy = HOME_SWIPE_POLICY) {
  let origin: HomeSwipeSample | null = null;
  let samples: HomeSwipeSample[] = [];
  let axis: HomeSwipeAxis = 'cancelled';
  let dx = 0, dy = 0;
  const finite = (...values: number[]) => values.every(Number.isFinite);
  const state = (): HomeSwipeState => origin ? { axis, dx, dy, offset: axis === 'horizontal' ? rubberBandOffset(dx, policy.limit) : 0 } : IDLE;
  const reset = () => { origin = null; samples = []; axis = 'cancelled'; dx = 0; dy = 0; };
  return {
    start(x: number, y: number, time: number): HomeSwipeState {
      reset();
      if (!finite(x, y, time)) return IDLE;
      origin = { x, y, time }; samples = [origin]; axis = 'pending';
      return state();
    },
    move(x: number, y: number, time: number): HomeSwipeState {
      if (!origin || axis === 'cancelled') return IDLE;
      if (!finite(x, y, time)) { reset(); return IDLE; }
      dx = x - origin.x; dy = y - origin.y;
      if (axis === 'pending' && Math.hypot(dx, dy) > policy.slop) axis = Math.abs(dx) > Math.abs(dy) * policy.ratio ? 'horizontal' : 'vertical';
      if (axis === 'vertical') { const s = { axis, dx, dy, offset: 0 }; reset(); return s; }
      samples = [...samples, { x, y, time }].filter(s => time - s.time <= 120).slice(-10);
      return state();
    },
    cancel(): void { reset(); },
    end(time: number): HomeSwipeDecision {
      const finished = state();
      const last = samples.at(-1), first = samples[0];
      let velocity = 0;
      if (finished.axis === 'horizontal' && last && first && finite(time) && time - last.time <= 80 && last.time - first.time >= 8) velocity = (last.x - first.x) / (last.time - first.time);
      reset();
      if (finished.axis !== 'horizontal') return { direction: null, dx: finished.dx, velocity: 0 };
      const travelled = Math.abs(finished.dx) >= policy.distance;
      const flicked = Math.abs(velocity) >= policy.velocity && Math.abs(finished.dx) > policy.slop && Math.sign(velocity) === Math.sign(finished.dx);
      if (!travelled && !flicked) return { direction: null, dx: finished.dx, velocity };
      return { direction: finished.dx < 0 ? 'next' : 'previous', dx: finished.dx, velocity };
    },
    state,
  };
}
export type HomeSwipeRecognizer = ReturnType<typeof createHomeSwipeRecognizer>;
