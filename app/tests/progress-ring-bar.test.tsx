import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProgressBar, ProgressRing } from '../src/design-system/primitives';

afterEach(cleanup);
const ringValue = (container: HTMLElement) => container.querySelector('.kairos-progress-ring__value')?.getAttribute('stroke-dasharray') ?? null;
const barWidth = (container: HTMLElement) => (container.querySelector('.kairos-progress-bar__value') as HTMLElement).style.width;

describe('T-058b rings and bars only draw', () => {
  it('a ring fills to its share, clamped to 0–100, and is hidden from screen readers', () => {
    expect(ringValue(render(<ProgressRing fill={64} tone="progress" />).container)).toBe('64 100');
    cleanup();
    expect(ringValue(render(<ProgressRing fill={140} tone="reached">✓</ProgressRing>).container)).toBe('100 100');
    cleanup();
    const { container } = render(<ProgressRing fill={0} tone="progress" />);
    expect(ringValue(container)).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    cleanup();
    // "Can't tell" is a dashed, empty ring whatever the fill.
    const unknown = render(<ProgressRing fill={80} tone="unknown">?</ProgressRing>).container;
    expect(ringValue(unknown)).toBeNull();
    expect(unknown.querySelector('.kairos-progress-ring__track')).toHaveAttribute('stroke-dasharray', '4 4');
    expect(unknown.firstElementChild).toHaveAttribute('data-tone', 'unknown');
  });

  it('a bar fills toward its limit, clamped, with its tone, hidden from screen readers', () => {
    const { container } = render(<ProgressBar fill={40} tone="inside" />);
    expect(barWidth(container)).toBe('40%');
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'inside');
    cleanup();
    expect(barWidth(render(<ProgressBar fill={130} tone="over" />).container)).toBe('100%');
    cleanup();
    expect(barWidth(render(<ProgressBar fill={-5} tone="inside" />).container)).toBe('0%');
    cleanup();
    expect(barWidth(render(<ProgressBar fill={50} tone="unknown" />).container)).toBe('0%');
  });
});
