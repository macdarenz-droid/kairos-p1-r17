import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
});
