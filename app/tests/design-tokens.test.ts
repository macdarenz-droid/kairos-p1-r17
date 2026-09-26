import { describe, expect, it } from 'vitest';
import { geometryTokens, semanticTokens } from '../src/design-system/tokens';

describe('P2 design token foundation', () => {
  it('exposes the locked semantic role groups without concrete theme values', () => {
    expect(Object.keys(semanticTokens)).toEqual(['background', 'surface', 'border', 'text', 'accent', 'trade', 'chart', 'state', 'glow']);
    expect(semanticTokens.surface.card).toBe('var(--kairos-surface-card)');
    expect(semanticTokens.trade.profit).toBe('var(--kairos-trade-profit)');
    expect(semanticTokens.chart.grid).toBe('var(--kairos-chart-grid)');
  });

  it('keeps geometry in a theme-neutral owner', () => {
    expect(geometryTokens.layout.pagePadding).toBe('1rem');
    expect(geometryTokens.layout.chartMinHeight).toBe('20rem');
    expect(geometryTokens.motion.normal).toBe('200ms');
  });
});
