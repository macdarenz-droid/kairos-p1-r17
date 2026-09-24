import { describe, expect, it } from 'vitest';
import { HOME_SWIPE_POLICY, createHomeSwipeRecognizer, nextHomeDashboardView, rubberBandOffset } from '../src/app/homeDashboardSwipeGesture';

const drag = (points: readonly (readonly [number, number, number])[]) => {
  const r = createHomeSwipeRecognizer();
  const [first, ...rest] = points;
  r.start(first[0], first[1], first[2]);
  let state = r.state();
  for (const [x, y, t] of rest) state = r.move(x, y, t);
  return { recognizer: r, state };
};

describe('Home swipe recognizer', () => {
  it('pages forward after a deliberate leftward travel regardless of speed', () => {
    const { recognizer, state } = drag([[200, 300, 0], [190, 302, 300], [160, 303, 600], [120, 305, 900]]);
    expect(state.axis).toBe('horizontal');
    expect(state.offset).toBeLessThan(0);
    expect(recognizer.end(1000)).toMatchObject({ direction: 'next', dx: -80 });
  });
  it('pages back on a short fast rightward flick', () => {
    const { recognizer } = drag([[100, 300, 0], [112, 300, 16], [126, 301, 32], [140, 301, 48]]);
    const decision = recognizer.end(56);
    expect(decision.direction).toBe('previous');
    expect(decision.velocity).toBeGreaterThanOrEqual(HOME_SWIPE_POLICY.velocity);
  });
  it('returns nothing for a short slow drag and leaves the recognizer idle', () => {
    const { recognizer } = drag([[100, 300, 0], [115, 300, 200], [130, 301, 500]]);
    expect(recognizer.end(900)).toMatchObject({ direction: null, dx: 30 });
    expect(recognizer.state().axis).toBe('cancelled');
  });
  it('yields to vertical and diagonal movement so native scrolling stays untouched', () => {
    expect(drag([[100, 300, 0], [102, 330, 50]]).state.axis).toBe('vertical');
    const diagonal = drag([[100, 300, 0], [130, 325, 50]]);
    expect(diagonal.state.axis).toBe('vertical');
    expect(diagonal.recognizer.end(80).direction).toBeNull();
  });
  it('stays pending inside the slop radius and never offsets the pane there', () => {
    const { state } = drag([[100, 300, 0], [106, 302, 20]]);
    expect(state).toMatchObject({ axis: 'pending', offset: 0 });
  });
  it('ignores a flick whose release direction disagrees with its travel', () => {
    const { recognizer } = drag([[100, 300, 0], [140, 300, 100], [130, 300, 116], [118, 300, 132]]);
    expect(recognizer.end(140).direction).toBeNull();
  });
  it('cancels on non-finite input and after an explicit cancel', () => {
    const r = createHomeSwipeRecognizer();
    expect(r.start(Number.NaN, 0, 0).axis).toBe('cancelled');
    r.start(0, 0, 0); r.move(40, 0, 10);
    r.cancel();
    expect(r.move(90, 0, 20).axis).toBe('cancelled');
    expect(r.end(30).direction).toBeNull();
  });
  it('rubber-bands the pane offset asymptotically toward the policy limit', () => {
    expect(rubberBandOffset(0, 96)).toBe(0);
    expect(rubberBandOffset(96, 96)).toBe(48);
    expect(Math.abs(rubberBandOffset(-5000, 96))).toBeLessThan(96);
    expect(rubberBandOffset(50, 0)).toBe(0);
  });
  it('maps directions onto the two Home views without wrapping', () => {
    expect(nextHomeDashboardView('market', 'next')).toBe('trades');
    expect(nextHomeDashboardView('trades', 'previous')).toBe('market');
    expect(nextHomeDashboardView('market', 'previous')).toBeNull();
    expect(nextHomeDashboardView('trades', 'next')).toBeNull();
    expect(nextHomeDashboardView('market', null)).toBeNull();
  });
});
