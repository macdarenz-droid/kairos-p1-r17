import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import { formatHomeDashboardLiveCryptoBubbleMovement } from '../src/app/homeDashboardGlassBubbleFormatting';

const decimal = (value: string) => value as DecimalString;

describe('home dashboard glass bubble movement formatting', () => {
  it('keeps normal movement labels compact and signed', () => {
    expect(formatHomeDashboardLiveCryptoBubbleMovement(decimal('7.12608767033327860778197340339074044'), false)).toBe('+7.13%');
    expect(formatHomeDashboardLiveCryptoBubbleMovement(decimal('-2.4'), false)).toBe('-2.40%');
  });

  it('uses readable compact notation for unusually large values', () => {
    expect(formatHomeDashboardLiveCryptoBubbleMovement(decimal('74044.1234'), false)).toBe('+74K%');
  });

  it('preserves visibility for very small movement values and missing data', () => {
    expect(formatHomeDashboardLiveCryptoBubbleMovement(decimal('0.0049'), false)).toBe('+0.0049%');
    expect(formatHomeDashboardLiveCryptoBubbleMovement(null, false)).toBe('Unavailable');
    expect(formatHomeDashboardLiveCryptoBubbleMovement(decimal('7'), true)).toBe('Unavailable');
  });
});
