import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { UnavailableNotice } from '../src/design-system/primitives';

afterEach(cleanup);
const backOnline = () => act(() => { window.dispatchEvent(new Event('online')); });

describe('T-048f the quiet retry when the browser is back online', () => {
  it('with retryWhenOnline, calls onRetry once per online event', () => {
    const onRetry = vi.fn();
    render(<UnavailableNotice message="Candles: you're offline." retryLabel="Try again" onRetry={onRetry} retryWhenOnline />);
    backOnline();
    backOnline();
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('without retryWhenOnline, never retries by itself', () => {
    const onRetry = vi.fn();
    render(<UnavailableNotice message="Candles: the price source didn't answer." retryLabel="Try again" onRetry={onRetry} />);
    backOnline();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('after it is gone, never retries', () => {
    const onRetry = vi.fn();
    const { unmount } = render(<UnavailableNotice message="Candles: you're offline." retryLabel="Try again" onRetry={onRetry} retryWhenOnline />);
    unmount();
    backOnline();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('hears an online event that comes as soon as the box is on screen (CI found it missed)', async () => {
    // Rendered the way a screen is outside a test's act(): the box shows first, and a passive effect would run later.
    const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const before = environment.IS_REACT_ACT_ENVIRONMENT;
    environment.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      for (let round = 0; round < 5; round += 1) {
        const host = document.createElement('div');
        document.body.append(host);
        const root = createRoot(host);
        const onRetry = vi.fn();
        root.render(<UnavailableNotice message="Candles: you're offline." retryLabel="Try again" onRetry={onRetry} retryWhenOnline />);
        // As soon as the box shows (checked each task, as waitFor does), the browser says it is back online.
        await new Promise<void>(resolve => {
          const check = () => { if (host.textContent?.includes("you're offline")) { window.dispatchEvent(new Event('online')); resolve(); } else setTimeout(check, 0); };
          check();
        });
        expect(onRetry, `round ${round}`).toHaveBeenCalledTimes(1);
        root.unmount();
        host.remove();
      }
    } finally {
      environment.IS_REACT_ACT_ENVIRONMENT = before;
    }
  });
});
