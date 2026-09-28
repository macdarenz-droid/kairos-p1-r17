import { constrainGlassPoint, limitGlassVelocity, type GlassBody, type GlassDrag } from './homeDashboardGlassMotion';

export const GLASS_HOLD_MS = 260;
const SCROLL_SLOP = 8;
type Point = { x: number; y: number; time: number };
type Session = {
  kind: 'touch' | 'pointer'; id: number; key: string; node: HTMLElement;
  startX: number; startY: number; offsetX: number; offsetY: number;
  held: boolean; timer: number; samples: Point[];
};
interface GlassDragPort {
  body(key: string): GlassBody | undefined;
  bounds(): { width: number; height: number };
  enabled(): boolean;
  move(drag: GlassDrag): void;
  end(key: string, vx: number, vy: number): void;
}

/** Ephemeral input only. Touch scroll stays native until a deliberate stationary hold.
 * Touch events are intentional: changing touch-action after a hold cannot reclaim a pointer pan.
 */
export function bindHomeDashboardGlassDrag(field: HTMLElement, port: GlassDragPort) {
  let session: Session | null = null;
  let blockClickUntil = 0;
  const now = () => performance.now();
  const bubble = (target: EventTarget | null) => {
    const node = target instanceof Element ? target.closest<HTMLElement>('[data-glass-key]') : null;
    return node && field.contains(node) ? node : null;
  };
  const point = (clientX: number, clientY: number) => {
    const rect = field.getBoundingClientRect(), bounds = port.bounds();
    return { x: (clientX - rect.left) * bounds.width / (rect.width || bounds.width), y: (clientY - rect.top) * bounds.height / (rect.height || bounds.height) };
  };
  const velocity = (samples: Point[], time: number) => {
    const last = samples.at(-1), first = samples.find(p => time - p.time <= 100);
    const result = { vx: 0, vy: 0 };
    if (last && first && time - last.time <= 80 && last.time - first.time >= 8) {
      result.vx = (last.x - first.x) * 1000 / (last.time - first.time);
      result.vy = (last.y - first.y) * 1000 / (last.time - first.time);
    }
    limitGlassVelocity(result);
    return result;
  };
  const finish = (fling = false) => {
    const current = session;
    if (!current) return;
    session = null;
    window.clearTimeout(current.timer);
    delete current.node.dataset.glassDragging;
    if (current.kind === 'pointer' && current.node.hasPointerCapture?.(current.id)) current.node.releasePointerCapture(current.id);
    if (current.held) {
      blockClickUntil = now() + 700;
      const v = fling ? velocity(current.samples, now()) : { vx: 0, vy: 0 };
      port.end(current.key, v.vx, v.vy);
    }
  };
  const begin = () => {
    const current = session;
    if (!current || !port.enabled()) { finish(); return; }
    const body = port.body(current.key);
    if (!body || !field.contains(current.node)) { finish(); return; }
    const p = point(current.startX, current.startY);
    current.offsetX = p.x - body.x; current.offsetY = p.y - body.y;
    current.held = true;
    current.samples = [{ x: body.x, y: body.y, time: now() }];
    current.node.dataset.glassDragging = 'true';
    if (current.kind === 'pointer') {
      try { current.node.setPointerCapture?.(current.id); } catch { /* Window listeners still finish a released pointer. */ }
    }
    port.move({ key: current.key, x: body.x, y: body.y, vx: 0, vy: 0 });
  };
  const start = (kind: Session['kind'], id: number, target: EventTarget | null, x: number, y: number) => {
    if (session) { finish(); return; }
    const node = bubble(target), key = node?.dataset.glassKey;
    if (!node || !key || !port.enabled() || !port.body(key) || !Number.isFinite(x) || !Number.isFinite(y)) return;
    blockClickUntil = 0;
    session = { kind, id, key, node, startX: x, startY: y, offsetX: 0, offsetY: 0, held: false, timer: window.setTimeout(begin, GLASS_HOLD_MS), samples: [] };
  };
  const move = (x: number, y: number, event: Event) => {
    const current = session;
    if (!current) return;
    if (!port.enabled() || !Number.isFinite(x) || !Number.isFinite(y)) { finish(); return; }
    // An uncancellable touch already belongs to the browser, including while a hold is pending.
    if (current.kind === 'touch' && !event.cancelable) { finish(); return; }
    if (!current.held) {
      if (Math.hypot(x - current.startX, y - current.startY) > SCROLL_SLOP) { blockClickUntil = now() + 700; finish(); }
      return;
    }
    event.preventDefault();
    const body = port.body(current.key);
    if (!body) { finish(); return; }
    const p = point(x, y), bounds = port.bounds();
    const target = constrainGlassPoint(p.x - current.offsetX, p.y - current.offsetY, body.radius, bounds.width, bounds.height);
    const time = now();
    current.samples.push({ ...target, time });
    current.samples = current.samples.filter(p => time - p.time <= 100).slice(-12);
    port.move({ key: current.key, ...target, ...velocity(current.samples, time) });
  };
  const pointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || event.button !== 0 || event.isPrimary === false) return;
    start('pointer', event.pointerId, event.target, event.clientX, event.clientY);
  };
  const pointerMove = (event: PointerEvent) => {
    if (session?.kind !== 'pointer' || session.id !== event.pointerId) return;
    if (event.buttons === 0) { finish(); return; }
    move(event.clientX, event.clientY, event);
  };
  const pointerUp = (event: PointerEvent) => { if (session?.kind === 'pointer' && session.id === event.pointerId) finish(true); };
  const pointerCancel = (event: PointerEvent) => { if (session?.kind === 'pointer' && session.id === event.pointerId) finish(); };
  const touchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) { finish(); return; }
    const t = event.changedTouches[0];
    if (t) start('touch', t.identifier, event.target, t.clientX, t.clientY);
  };
  const touchMove = (event: TouchEvent) => {
    if (session?.kind !== 'touch') return;
    if (event.touches.length !== 1) { finish(); return; }
    const t = Array.from(event.changedTouches).find(t => t.identifier === session?.id);
    if (t) move(t.clientX, t.clientY, event);
  };
  const touchEnd = (event: TouchEvent) => {
    if (session?.kind !== 'touch' || !Array.from(event.changedTouches).some(t => t.identifier === session?.id)) return;
    if (session.held && event.cancelable) event.preventDefault();
    finish(true);
  };
  const touchCancel = () => { if (session?.kind === 'touch') finish(); };
  const multiTouch = (event: TouchEvent) => { if (session?.kind === 'touch' && event.touches.length > 1) finish(); };
  const click = (event: MouseEvent) => {
    // Keyboard/assistive activation remains usable; a genuine new pointer down clears the consumed gesture.
    if (event.detail !== 0 && bubble(event.target) && (session?.held || now() < blockClickUntil)) {
      event.preventDefault(); event.stopPropagation();
    }
  };
  const contextMenu = (event: Event) => { if (session?.held && bubble(event.target)) event.preventDefault(); };
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') finish(); };
  const blur = () => finish();
  field.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('pointercancel', pointerCancel);
  field.addEventListener('lostpointercapture', pointerCancel);
  field.addEventListener('touchstart', touchStart, { passive: true });
  field.addEventListener('touchmove', touchMove, { passive: false });
  field.addEventListener('touchend', touchEnd, { passive: false });
  field.addEventListener('touchcancel', touchCancel);
  window.addEventListener('touchstart', multiTouch, { passive: true });
  field.addEventListener('click', click, true);
  field.addEventListener('contextmenu', contextMenu);
  window.addEventListener('keydown', escape);
  window.addEventListener('blur', blur);
  return {
    cancel: () => finish(),
    activeKey: () => session?.key ?? null,
    dispose() {
      finish();
      field.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointercancel', pointerCancel);
      field.removeEventListener('lostpointercapture', pointerCancel);
      field.removeEventListener('touchstart', touchStart);
      field.removeEventListener('touchmove', touchMove);
      field.removeEventListener('touchend', touchEnd);
      field.removeEventListener('touchcancel', touchCancel);
      window.removeEventListener('touchstart', multiTouch);
      field.removeEventListener('click', click, true);
      field.removeEventListener('contextmenu', contextMenu);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('blur', blur);
    },
  };
}
