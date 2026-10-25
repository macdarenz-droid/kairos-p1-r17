import { describe, expect, it } from 'vitest';
import { decimalPlaces } from '../src/domain/calculations';

describe('T-050d decimal places', () => {
  it('counts the places of the shortest exact form', () => {
    expect(decimalPlaces('10.50')).toBe(1);
    expect(decimalPlaces('3')).toBe(0);
    expect(decimalPlaces('-0.001')).toBe(3);
    expect(decimalPlaces('-0')).toBe(0);
  });

  it('gives null for a value that is not a decimal', () => {
    expect(decimalPlaces('abc')).toBeNull();
  });
});
