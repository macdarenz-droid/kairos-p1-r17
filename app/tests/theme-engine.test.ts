import { describe, expect, it } from 'vitest';
import { applyTheme, defaultThemeId, resolveTheme, themeIds, themeRegistry } from '../src/design-system/themes';

describe('P3 theme engine active registry', () => {
  it('registers exactly the five approved active themes and makes Ink the default', () => {
    expect(themeIds).toEqual(['ink', 'paper', 'kairos-depth', 'cosmic', 'ocean']);
    expect(defaultThemeId).toBe('ink');
    expect(Object.keys(themeRegistry)).toEqual(themeIds);
  });

  it('resolves system preference to the certified default until a later preference policy owns it', () => {
    expect(resolveTheme('system', false)).toBe('ink');
    expect(resolveTheme('system', true)).toBe('ink');
    expect(resolveTheme('paper', true)).toBe('paper');
    expect(resolveTheme('cosmic', true)).toBe('cosmic');
    expect(resolveTheme('ocean', false)).toBe('ocean');
  });

  it('keeps every active theme on one semantic token contract', () => {
    const expected = Object.keys(themeRegistry[defaultThemeId].tokens).sort();
    for (const theme of Object.values(themeRegistry)) expect(Object.keys(theme.tokens).sort()).toEqual(expected);
  });

  it('keeps geometry out of every theme definition', () => {
    for (const theme of Object.values(themeRegistry)) {
      expect(Object.keys(theme.tokens).some((key) => /spacing|radius|control|page-padding|card-gap|chart-min|navigation|motion/.test(key))).toBe(false);
    }
  });

  it('keeps themes visually distinct without changing their token shape', () => {
    expect(themeRegistry['kairos-depth'].tokens['--kairos-accent-primary']).not.toBe(themeRegistry.cosmic.tokens['--kairos-accent-primary']);
    expect(themeRegistry.cosmic.tokens['--kairos-accent-primary']).not.toBe(themeRegistry.ocean.tokens['--kairos-accent-primary']);
    expect(themeRegistry.ink.tokens['--kairos-background-base']).not.toBe(themeRegistry.paper.tokens['--kairos-background-base']);
    expect(themeRegistry.ink.colorScheme).toBe('dark');
    expect(themeRegistry.paper.colorScheme).toBe('light');
  });

  it('applies presentation state through the single theme owner', () => {
    const root = document.createElement('html');
    applyTheme(root, 'ocean');
    expect(root.dataset.kairosTheme).toBe('ocean');
    expect(root.style.colorScheme).toBe('dark');
    expect(root.style.getPropertyValue('--kairos-background-base')).toBe(themeRegistry.ocean.tokens['--kairos-background-base']);
    applyTheme(root, 'paper');
    expect(root.dataset.kairosTheme).toBe('paper');
    expect(root.style.colorScheme).toBe('light');
  });
});
