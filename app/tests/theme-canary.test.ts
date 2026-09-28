import { describe, expect, it } from 'vitest';
import {
  evaluateActiveThemeMatrix,
  evaluateThemeCanary,
  themeCanarySurfaces,
  themeCanaryTokenContract,
  themeIds,
  themeRegistry,
} from '../src/design-system/themes';

describe('P3.3 active theme canary contract', () => {
  it('covers every required critical visual fixture category', () => {
    expect(themeCanarySurfaces).toEqual([
      'card', 'button', 'input', 'tabs', 'profit', 'loss', 'chart', 'modal',
      'warning', 'disabled', 'selected', 'focus', 'loading',
    ]);
    expect(Object.keys(themeCanaryTokenContract)).toEqual(themeCanarySurfaces);
  });

  it.for(themeIds)('%s passes the same canary token contract', (themeId) => {
    const result = evaluateThemeCanary(themeId);
    expect(result.passes).toBe(true);
    expect(result.missingTokens).toEqual([]);
    expect(result.forbiddenGeometryTokens).toEqual([]);
  });

  it('evaluates the complete active-theme matrix with no special-case theme', () => {
    const matrix = evaluateActiveThemeMatrix();
    expect(matrix.map(({ themeId }) => themeId)).toEqual(themeIds);
    expect(matrix.every(({ passes }) => passes)).toBe(true);
  });

  it('keeps the canary contract presentation-only', () => {
    const canaryTokens = Object.values(themeCanaryTokenContract).flat();
    expect(canaryTokens.every((token) => token.startsWith('--kairos-'))).toBe(true);
    expect(canaryTokens.some((token) => /spacing|radius|height|gap|motion|padding/i.test(token))).toBe(false);
    for (const themeId of themeIds) {
      expect(Object.keys(themeRegistry[themeId].tokens).some((token) => /spacing|radius|height|gap|motion|padding/i.test(token))).toBe(false);
    }
  });
});
