import { describe, expect, it } from 'vitest';
import { chartThemeTokenKeys, getChartTheme, themeIds, themeRegistry } from '../src/design-system/themes';

describe('chart theme adapter', () => {
  it('maps every active theme through the same semantic chart contract', () => {
    for (const themeId of themeIds) {
      const chartTheme = getChartTheme(themeId);
      expect(Object.keys(chartTheme)).toEqual(Object.keys(chartThemeTokenKeys));
      for (const [role, token] of Object.entries(chartThemeTokenKeys)) {
        expect(chartTheme[role as keyof typeof chartTheme]).toBe(themeRegistry[themeId].tokens[token]);
      }
    }
  });

  it('keeps renderer output presentation-only', () => {
    const forbidden = /spacing|radius|height|width|padding|gap|motion|duration/i;
    expect(Object.keys(chartThemeTokenKeys).some((key) => forbidden.test(key))).toBe(false);
    expect(Object.values(chartThemeTokenKeys).some((token) => forbidden.test(token))).toBe(false);
  });

  it('resolves theme-specific chart presentation without storing renderer state', () => {
    expect(getChartTheme('kairos-depth').background).not.toBe(getChartTheme('cosmic').background);
    expect(getChartTheme('cosmic').drawingPrimary).not.toBe(getChartTheme('ocean').drawingPrimary);
    expect(getChartTheme('kairos-depth')).not.toHaveProperty('series');
    expect(getChartTheme('kairos-depth')).not.toHaveProperty('data');
  });
});
