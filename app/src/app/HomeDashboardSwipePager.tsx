import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createHomeSwipeRecognizer, nextHomeDashboardView, type HomeDashboardView } from './homeDashboardSwipeGesture';
import './homeDashboardSwipePager.css';

type EnterDirection = 'none' | 'forward' | 'back';
interface HomeDashboardSwipePagerProps {
  readonly view: HomeDashboardView;
  readonly onViewChange: (view: HomeDashboardView) => void;
  readonly children: ReactNode;
}
interface SwipePort { view(): HomeDashboardView; change(view: HomeDashboardView): void }

/** Ephemeral touch input only. One pane stays mounted; a held bubble drag or a second finger yields. */
export function bindHomeDashboardSwipe(frame: HTMLElement, port: SwipePort): () => void {
  const recognizer = createHomeSwipeRecognizer();
  let id: number | null = null;
  const pane = () => frame.querySelector<HTMLElement>('.kairos-home-pager__pane');
  const settle = () => {
    const node = pane();
    delete frame.dataset.swiping;
    if (node) { node.style.removeProperty('--kairos-home-pager-x'); node.style.removeProperty('transform'); }
  };
  const cancel = () => { id = null; recognizer.cancel(); settle(); };
  const touch = (event: TouchEvent) => Array.from(event.changedTouches).find(t => t.identifier === id);
  const touchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) { cancel(); return; }
    const t = event.changedTouches[0];
    const held = event.target instanceof Element && event.target.closest('[data-glass-dragging="true"]');
    if (!t || held) return;
    id = t.identifier;
    recognizer.start(t.clientX, t.clientY, event.timeStamp);
  };
  const touchMove = (event: TouchEvent) => {
    if (id === null) return;
    // A held bubble owns its touch; a second finger or an uncancellable native pan belongs to the browser.
    if (event.touches.length !== 1 || event.defaultPrevented) { cancel(); return; }
    const t = touch(event); if (!t) return;
    const state = recognizer.move(t.clientX, t.clientY, event.timeStamp);
    if (state.axis !== 'horizontal') { if (state.axis !== 'pending') cancel(); return; }
    if (!event.cancelable) { cancel(); return; }
    event.preventDefault();
    const node = pane();
    frame.dataset.swiping = 'true';
    if (node) { node.style.setProperty('--kairos-home-pager-x', `${state.offset}px`); node.style.transform = 'translateX(var(--kairos-home-pager-x))'; }
  };
  const touchEnd = (event: TouchEvent) => {
    if (id === null || !touch(event)) return;
    const decision = recognizer.end(event.timeStamp);
    id = null; settle();
    const next = nextHomeDashboardView(port.view(), decision.direction);
    if (next) port.change(next);
  };
  frame.addEventListener('touchstart', touchStart, { passive: true });
  frame.addEventListener('touchmove', touchMove, { passive: false });
  frame.addEventListener('touchend', touchEnd);
  frame.addEventListener('touchcancel', cancel);
  return () => {
    cancel();
    frame.removeEventListener('touchstart', touchStart);
    frame.removeEventListener('touchmove', touchMove);
    frame.removeEventListener('touchend', touchEnd);
    frame.removeEventListener('touchcancel', cancel);
  };
}

export function HomeDashboardSwipePager({ view, onViewChange, children }: HomeDashboardSwipePagerProps) {
  const frame = useRef<HTMLDivElement>(null);
  const latest = useRef({ view, onViewChange });
  latest.current = { view, onViewChange };
  const [track, setTrack] = useState<{ view: HomeDashboardView; enter: EnterDirection }>({ view, enter: 'none' });
  if (track.view !== view) setTrack({ view, enter: view === 'trades' ? 'forward' : 'back' });
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    return bindHomeDashboardSwipe(node, { view: () => latest.current.view, change: next => latest.current.onViewChange(next) });
  }, []);
  return (
    <div ref={frame} className="kairos-home-pager" data-view={view}>
      <div key={view} className="kairos-home-pager__pane" data-enter={track.view === view ? track.enter : 'none'}>{children}</div>
    </div>
  );
}
