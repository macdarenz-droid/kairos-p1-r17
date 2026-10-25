import { useRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHomeDashboardGlassMotion } from '../src/app/useHomeDashboardGlassMotion';
import type { GlassCircle } from '../src/app/homeDashboardGlassLayout';
import { GLASS_HOLD_MS } from '../src/app/homeDashboardGlassDrag';

const initial: GlassCircle[] = [{ key: 'BTC', x: 80, y: 100, radius: 24 }, { key: 'ETH', x: 200, y: 100, radius: 24 }];
const selected = vi.fn();
function MapView({ circles = initial, hidden = false, width = 400 }: { circles?: GlassCircle[]; hidden?: boolean; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useHomeDashboardGlassMotion(ref, circles, width, 400, hidden);
  return <div ref={ref} data-field>{circles.map(c => <button key={c.key} data-glass-key={c.key} style={{ left: c.x - c.radius, top: c.y - c.radius, width: c.radius * 2, height: c.radius * 2 }} onClick={() => selected(c.key)}>{c.key}</button>)}</div>;
}
function pointer(target: EventTarget, type: string, x = 80, y = 100) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y });
  Object.assign(event, { pointerType: 'mouse', pointerId: 1, isPrimary: true });
  act(() => target.dispatchEvent(event));
}
let frames: Map<number, FrameRequestCallback>, nextFrame: number, reduced = false;
let mediaListeners: Set<() => void>;
const tick = () => act(() => {
  vi.advanceTimersByTime(16);
  const pending = [...frames.values()]; frames.clear(); pending.forEach(f => f(performance.now()));
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  selected.mockClear(); frames = new Map(); nextFrame = 1; reduced = false; mediaListeners = new Set();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { const id = nextFrame++; frames.set(id, cb); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced; }, addEventListener: (_: string, fn: () => void) => mediaListeners.add(fn), removeEventListener: (_: string, fn: () => void) => mediaListeners.delete(fn) }));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this.hasAttribute('data-field') ? 400 : Number.parseFloat(this.style.width) || 0;
    return { x: 0, y: 0, left: 0, top: 0, width, height: this.hasAttribute('data-field') ? 400 : width, right: width, bottom: width, toJSON() {} };
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('shared motion runtime gesture lifecycle', () => {
  it('keeps the held identity through a live radius/ranking refresh, then suppresses only the consumed click', () => {
    const { getByText, rerender } = render(<MapView />), btc = getByText('BTC');
    pointer(btc, 'pointerdown'); act(() => vi.advanceTimersByTime(GLASS_HOLD_MS));
    pointer(window, 'pointermove', 135, 150);
    const before = btc.style.translate;
    const next = [{ ...initial[1] }, { ...initial[0], radius: 30, x: 90 }];
    const snapshot = JSON.stringify(next);
    rerender(<MapView circles={next} />);
    expect(getByText('BTC')).toBe(btc); expect(btc.dataset.glassDragging).toBe('true');
    expect(btc.style.translate).not.toBe(before); // New React origin, same held physical position.
    pointer(window, 'pointermove', 175, 160); pointer(window, 'pointerup', 175, 160);
    fireEvent.click(btc, { detail: 1 }); expect(selected).not.toHaveBeenCalled();
    fireEvent.click(btc, { detail: 0 }); expect(selected).toHaveBeenCalledWith('BTC');
    expect(JSON.stringify(next)).toBe(snapshot);
  });
  it.each(['hidden', 'removed', 'resize'] as const)('cancels a hold safely when %s changes', change => {
    const { getByText, rerender } = render(<MapView />), btc = getByText('BTC');
    pointer(btc, 'pointerdown'); act(() => vi.advanceTimersByTime(GLASS_HOLD_MS));
    rerender(<MapView hidden={change === 'hidden'} circles={change === 'removed' ? [initial[1]] : initial} width={change === 'resize' ? 320 : 400} />);
    expect(btc.dataset.glassDragging).toBeUndefined();
    if (change === 'hidden') expect(frames.size).toBe(0);
  });
  it('permits direct reduced-motion dragging but no fling, then restores ambient motion on preference change', () => {
    reduced = true;
    const { getByText } = render(<MapView />), btc = getByText('BTC');
    expect(frames.size).toBe(0);
    pointer(btc, 'pointerdown'); act(() => vi.advanceTimersByTime(GLASS_HOLD_MS + 20));
    pointer(window, 'pointermove', 140, 160); pointer(window, 'pointerup', 140, 160);
    const still = btc.style.translate; tick(); tick(); expect(btc.style.translate).toBe(still);
    reduced = false; act(() => mediaListeners.forEach(fn => fn())); tick(); tick();
    expect(btc.style.translate).not.toBe(still);
  });
  it('removes timers, frame loops, preference listeners and held styling on unmount', () => {
    const { getByText, unmount } = render(<MapView />), btc = getByText('BTC');
    pointer(btc, 'pointerdown'); act(() => vi.advanceTimersByTime(GLASS_HOLD_MS));
    unmount(); expect(btc.dataset.glassDragging).toBeUndefined(); expect(frames.size).toBe(0); expect(mediaListeners.size).toBe(0);
    pointer(window, 'pointermove', 150, 100); tick(); expect(frames.size).toBe(0);
  });
});
