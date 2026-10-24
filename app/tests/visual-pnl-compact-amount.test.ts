import { describe, expect, it } from 'vitest';
import { describeVisualPnlCompactAmount } from '../src/application/visual-pnl';
import type { DecimalString } from '../src/domain/trades';

const short = (value: string) => describeVisualPnlCompactAmount(value as DecimalString);

describe('T-051b short amounts for small spaces', () => {
  it('shortens thousands, millions and billions to one place', () => {
    expect(short('1234.5')).toBe('+1.2K');
    expect(short('1000')).toBe('+1K');
    expect(short('-25000')).toBe('-25K');
    expect(short('1500000000')).toBe('+1.5B');
  });

  it('moves up one unit when the rounding reaches 1000', () => {
    expect(short('999.6')).toBe('+1K');
    expect(short('999960')).toBe('+1M');
  });

  it('keeps 0, 1 or 2 places below 1000', () => {
    expect(short('-85')).toBe('-85');
    expect(short('123.4')).toBe('+123');
    expect(short('12.345')).toBe('+12.3');
    expect(short('1.005')).toBe('+1.01');
    expect(short('2.50')).toBe('+2.5');
  });

  it('keeps two significant digits below 1', () => {
    expect(short('0.004236')).toBe('+0.0042');
    expect(short('-0.1234')).toBe('-0.12');
    expect(short('0.996')).toBe('+1');
    expect(short('0.000000000000000000001')?.startsWith('+0.0000')).toBe(true);
  });

  it('shows 0 without a sign, and nothing for a value the kernel refuses', () => {
    expect(short('0')).toBe('0');
    expect(short('abc')).toBeNull();
  });
});
