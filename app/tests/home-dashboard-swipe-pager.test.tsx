import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
const { mount, unmount } = vi.hoisted(() => ({ mount: vi.fn(), unmount: vi.fn() }));
vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({ HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => { useEffect(() => { mount(); return unmount; }, []); return <div>market runtime</div>; } }));
vi.mock('../src/app/HomeDashboardYourTrades', () => ({ HomeDashboardYourTrades: () => <div>saved-trade view</div> }));
import { HomeRoute } from '../src/app/HomeRoute';

const touch = (x: number, y: number) => ({ identifier: 1, clientX: x, clientY: y });
// Event timestamps are the real clock, so a short gesture must settle longer than the flick window (80ms) before
// release to be a deterministic slow drag whatever the machine load; long gestures page by distance regardless of speed.
const swipe = async (target: Element, from: [number, number], to: [number, number], { steps = 4, prevent = false, settleMs = 0 } = {}) => {
  fireEvent.touchStart(target, { touches: [touch(...from)], changedTouches: [touch(...from)] });
  for (let i = 1; i <= steps; i++) {
    const p = touch(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps);
    const event = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [p] as never, changedTouches: [p] as never });
    if (prevent) event.preventDefault();
    target.dispatchEvent(event);
  }
  if (settleMs > 0) await new Promise(resolve => setTimeout(resolve, settleMs));
  fireEvent.touchEnd(target, { touches: [], changedTouches: [touch(...to)] });
};
const pager = () => document.querySelector('.kairos-home-pager') as HTMLElement;
const pane = () => document.querySelector('.kairos-home-pager__pane') as HTMLElement;
const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

describe('Home swipe pager', () => {
  it('swipes between Live Market and Your Trades while keeping a single mounted pane', async () => {
    const { container } = render(<HomeRoute />);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.kairos-home-switch__ink')).toBeTruthy();
    expect(container.querySelector('.kairos-home-switch')?.getAttribute('data-view')).toBe('market');
    await swipe(pane(), [300, 200], [180, 204]);
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(screen.getByText('saved-trade view')).toBeTruthy();
    expect(screen.queryByText('market runtime')).toBeNull();
    expect(pressed('Your Trades')).toBe('true');
    expect(pager().dataset.view).toBe('trades');
    expect(pane().dataset.enter).toBe('forward');
    expect(container.querySelector('.kairos-home-switch')?.getAttribute('data-view')).toBe('trades');
    await swipe(pane(), [100, 200], [240, 198]);
    expect(mount).toHaveBeenCalledTimes(2);
    expect(pressed('Live Market')).toBe('true');
    expect(pane().dataset.enter).toBe('back');
    expect(document.querySelectorAll('.kairos-home-pager__pane')).toHaveLength(1);
  });
  it('does not wrap past the ends and leaves vertical or short gestures alone', async () => {
    render(<HomeRoute />);
    await swipe(pane(), [100, 200], [260, 200]);
    expect(pressed('Live Market')).toBe('true');
    await swipe(pane(), [200, 100], [204, 300]);
    expect(pressed('Live Market')).toBe('true');
    await swipe(pane(), [200, 100], [170, 100], { settleMs: 120 });
    expect(pressed('Live Market')).toBe('true');
    expect(pane().style.transform).toBe('');
    expect(pager().dataset.swiping).toBeUndefined();
  });
  it('yields to a held bubble drag and to a second finger', async () => {
    render(<HomeRoute />);
    await swipe(pane(), [300, 200], [150, 200], { prevent: true });
    expect(pressed('Live Market')).toBe('true');
    fireEvent.touchStart(pane(), { touches: [touch(300, 200)], changedTouches: [touch(300, 200)] });
    fireEvent.touchMove(pane(), { touches: [touch(240, 200), { identifier: 2, clientX: 320, clientY: 240 }], changedTouches: [touch(240, 200)] });
    fireEvent.touchEnd(pane(), { touches: [], changedTouches: [touch(150, 200)] });
    expect(pressed('Live Market')).toBe('true');
    const held = document.createElement('div');
    held.dataset.glassDragging = 'true';
    pane().appendChild(held);
    await swipe(held, [300, 200], [150, 200]);
    expect(pressed('Live Market')).toBe('true');
  });
  it('follows the finger with a rubber-banded pane offset and settles on release', () => {
    render(<HomeRoute />);
    fireEvent.touchStart(pane(), { touches: [touch(300, 200)], changedTouches: [touch(300, 200)] });
    fireEvent.touchMove(pane(), { touches: [touch(260, 201)], changedTouches: [touch(260, 201)] });
    expect(pager().dataset.swiping).toBe('true');
    expect(pane().style.getPropertyValue('--kairos-home-pager-x')).toMatch(/^-\d+(\.\d+)?px$/);
    fireEvent.touchCancel(pane(), { touches: [], changedTouches: [touch(260, 201)] });
    expect(pager().dataset.swiping).toBeUndefined();
    expect(pane().style.getPropertyValue('--kairos-home-pager-x')).toBe('');
    expect(pressed('Live Market')).toBe('true');
  });
});
