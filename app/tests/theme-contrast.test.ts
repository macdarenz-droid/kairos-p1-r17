import { describe, expect, it } from 'vitest';
import { contrastRatio, evaluateThemeContrast, evaluateTokenContrast, themeIds, themeRegistry } from '../src/design-system/themes';

describe('T-049a contrast and depth for every theme', () => {
  it('computes the WCAG ratio, lays a translucent colour over the background, and refuses what it cannot read', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('rgba(255,255,255,.14)', '#0d0f13')).toBeCloseTo(1.46, 2);
    expect(contrastRatio('red', '#000')).toBeNull();
  });

  it.each(themeIds)('%s: every text colour, field edge, button text and axis label passes', themeId => {
    expect(evaluateThemeContrast(themeId).failures).toEqual([]);
    expect(evaluateThemeContrast(themeId).passes).toBe(true);
  });

  it.each(['kairos-depth', 'cosmic', 'ocean'] as const)('%s: cards stand off the page, under the top glow too, and raised layers off cards', themeId => {
    const { depth } = evaluateThemeContrast(themeId);
    expect(depth.cardOnPage).toBeGreaterThanOrEqual(1.12);
    expect(depth.cardOnGlow).toBeGreaterThanOrEqual(1.1);
    expect(depth.raisedOnCard).toBeGreaterThanOrEqual(1.1);
    expect(depth.cardEdgeOnPage).toBeGreaterThanOrEqual(1.5);
  });

  it('a theme without a field-edge colour fails, naming the token', () => {
    const { ['--kairos-border-field']: _removed, ...tokens } = themeRegistry.ink.tokens;
    const result = evaluateTokenContrast(tokens, { requireDepth: false });
    expect(result.passes).toBe(false);
    expect(result.failures.some(failure => failure.foreground === '--kairos-border-field')).toBe(true);
  });
});
