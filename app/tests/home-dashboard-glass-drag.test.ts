import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindHomeDashboardGlassDrag, GLASS_HOLD_MS } from '../src/app/homeDashboardGlassDrag';
import type { GlassDrag } from '../src/app/homeDashboardGlassMotion';

function pointer(target: EventTarget, type: string, extras: Record<string, unknown> = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 80, clientY: 100, button: 0, buttons: 1, ...extras });
  Object.assign(event, { pointerType: 'mouse', pointerId: 1, isPrimary: true, ...Object.fromEntries(Object.entries(extras).filter(([key]) => !['clientX', 'clientY', 'button', 'buttons'].includes(key))) });
  target.dispatchEvent(event); return event;
}
function touch(target: EventTarget, type: string, x = 80, y = 100, options: { count?: number; cancelable?: boolean } = {}) {
  const item = { identifier: 4, clientX: x, clientY: y };
  const event = new Event(type, { bubbles: true, cancelable: options.cancelable ?? true });
  Object.assign(event, { changedTouches: [item], touches: type === 'touchend' || type === 'touchcancel' ? [] : Array.from({ length: options.count ?? 1 }, (_, i) => ({ ...item, identifier: i === 0 ? 4 : 9 })) });
  target.dispatchEvent(event); return event;
}
function fixture() {
  const field = document.createElement('div'), node = document.createElement('button');
  node.dataset.glassKey = 'trade-id'; field.append(node); document.body.append(field);
  vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 400, bottom: 400, right: 400, toJSON() {} });
  const body = { key: 'trade-id', x: 80, y: 100, radius: 24, vx: 0, vy: 0 };
  const selected = vi.fn(); node.addEventListener('click', selected);
  const move = vi.fn((drag: GlassDrag) => Object.assign(body, drag)), end = vi.fn();
  const control = bindHomeDashboardGlassDrag(field, { body: key => key === body.key ? body : undefined, bounds: () => ({ width: 400, height: 400 }), enabled: () => true, move, end });
  return { field, node, body, selected, move, end, control };
}
let dispose: (() => void) | undefined;
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
afterEach(() => { dispose?.(); dispose = undefined; document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('bubble hold gesture and native input boundaries', () => {
  it('keeps quick taps selectable and cancels their pending hold timer', () => {
    const f = fixture(); dispose = f.control.dispose;
    touch(f.node, 'touchstart'); vi.advanceTimersByTime(60); touch(f.node, 'touchend');
    f.node.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    vi.advanceTimersByTime(GLASS_HOLD_MS);
    expect(f.selected).toHaveBeenCalledOnce(); expect(f.move).not.toHaveBeenCalled();
  });
  it('lets an early swipe scroll without grabbing, cancelling or preventing native movement', () => {
    const f = fixture(); dispose = f.control.dispose;
    touch(f.node, 'touchstart'); vi.advanceTimersByTime(40);
    const event = touch(f.node, 'touchmove', 80, 140); vi.advanceTimersByTime(GLASS_HOLD_MS);
    expect(event.defaultPrevented).toBe(false); expect(f.move).not.toHaveBeenCalled();
    expect(f.control.activeKey()).toBeNull();
    f.node.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); expect(f.selected).not.toHaveBeenCalled();
  });
  it('holds, drags and flings without selecting, then accepts a new tap and keyboard activation', () => {
    const f = fixture(); dispose = f.control.dispose;
    touch(f.node, 'touchstart'); vi.advanceTimersByTime(GLASS_HOLD_MS);
    expect(f.node.dataset.glassDragging).toBe('true');
    vi.advanceTimersByTime(20); expect(touch(f.node, 'touchmove', 140, 120).defaultPrevented).toBe(true);
    expect(f.body.x).toBe(140); expect(f.body.y).toBe(120);
    vi.advanceTimersByTime(20); touch(f.node, 'touchmove', 180, 130);
    expect(touch(f.node, 'touchend', 180, 130).defaultPrevented).toBe(true);
    expect(f.node.dataset.glassDragging).toBeUndefined();
    const [key, vx, vy] = f.end.mock.calls[0]; expect(key).toBe('trade-id'); expect(vx).toBeGreaterThan(0); expect(Math.hypot(vx, vy)).toBeLessThanOrEqual(480.001);
    f.node.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); expect(f.selected).not.toHaveBeenCalled();
    touch(f.node, 'touchstart', 180, 130); touch(f.node, 'touchend', 180, 130);
    f.node.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    f.node.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })); expect(f.selected).toHaveBeenCalledTimes(2);
  });
  it('drops stale fling velocity after the finger stops, and ignores duplicate touch pointer events', () => {
    const f = fixture(); dispose = f.control.dispose;
    pointer(f.node, 'pointerdown', { pointerType: 'touch' });
    touch(f.node, 'touchstart'); vi.advanceTimersByTime(GLASS_HOLD_MS + 20);
    touch(f.node, 'touchmove', 180, 100); vi.advanceTimersByTime(120); touch(f.node, 'touchend', 180, 100);
    expect(f.end).toHaveBeenCalledWith('trade-id', 0, 0); expect(f.move).toHaveBeenCalledTimes(2);
  });
  it.each(['pointercancel', 'lostpointercapture', 'blur', 'escape', 'dispose'] as const)('cleans up an active mouse drag on %s', reason => {
    const f = fixture(); dispose = f.control.dispose;
    pointer(f.node, 'pointerdown'); vi.advanceTimersByTime(GLASS_HOLD_MS);
    if (reason === 'blur') window.dispatchEvent(new Event('blur'));
    else if (reason === 'escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    else if (reason === 'dispose') f.control.dispose();
    else pointer(f.node, reason);
    expect(f.node.dataset.glassDragging).toBeUndefined(); expect(f.control.activeKey()).toBeNull();
    expect(f.end).toHaveBeenCalledWith('trade-id', 0, 0);
    pointer(window, 'pointermove', { clientX: 200 }); expect(f.move).toHaveBeenCalledTimes(1);
  });
  it.each(['touchcancel', 'multitouch', 'uncancellable'] as const)('yields touch ownership on %s', reason => {
    const f = fixture(); dispose = f.control.dispose;
    touch(f.node, 'touchstart'); vi.advanceTimersByTime(GLASS_HOLD_MS);
    if (reason === 'touchcancel') touch(f.node, 'touchcancel');
    else if (reason === 'multitouch') touch(document.body, 'touchstart', 100, 100, { count: 2 });
    else expect(touch(f.node, 'touchmove', 140, 100, { cancelable: false }).defaultPrevented).toBe(false);
    expect(f.control.activeKey()).toBeNull(); expect(f.end).toHaveBeenCalledWith('trade-id', 0, 0);
  });
  it('ignores right clicks and secondary pointers, and removes a pending timer on disposal', () => {
    const f = fixture(); dispose = f.control.dispose;
    pointer(f.node, 'pointerdown', { button: 2 }); pointer(f.node, 'pointerdown', { isPrimary: false });
    vi.advanceTimersByTime(GLASS_HOLD_MS); expect(f.move).not.toHaveBeenCalled();
    pointer(f.node, 'pointerdown'); f.control.dispose(); vi.advanceTimersByTime(GLASS_HOLD_MS);
    expect(f.move).not.toHaveBeenCalled();
  });
  it('cancels a pending hold once even a small movement belongs to the native browser gesture', () => {
    const f = fixture(); dispose = f.control.dispose;
    touch(f.node, 'touchstart'); touch(f.node, 'touchmove', 80, 103, { cancelable: false });
    vi.advanceTimersByTime(GLASS_HOLD_MS);
    expect(f.control.activeKey()).toBeNull(); expect(f.move).not.toHaveBeenCalled();
  });
});
