import type { ThemeId } from './themeEngine';
import { themeIds, themeRegistry } from './themeEngine';

export const themeCanarySurfaces = [
  'card', 'button', 'input', 'tabs', 'profit', 'loss', 'chart', 'modal',
  'warning', 'disabled', 'selected', 'focus', 'loading',
] as const;

export type ThemeCanarySurface = (typeof themeCanarySurfaces)[number];

export const themeCanaryTokenContract: Readonly<Record<ThemeCanarySurface, readonly string[]>> = Object.freeze({
  card: ['--kairos-surface-card', '--kairos-border-default', '--kairos-text-primary'],
  button: ['--kairos-accent-primary', '--kairos-text-primary', '--kairos-state-hover', '--kairos-state-pressed'],
  input: ['--kairos-surface-input', '--kairos-border-default', '--kairos-text-primary', '--kairos-text-muted'],
  tabs: ['--kairos-surface-raised', '--kairos-border-active', '--kairos-accent-primary', '--kairos-text-secondary'],
  profit: ['--kairos-trade-profit'],
  loss: ['--kairos-trade-loss'],
  chart: ['--kairos-chart-background', '--kairos-chart-grid', '--kairos-chart-axis', '--kairos-chart-crosshair', '--kairos-chart-candle-up', '--kairos-chart-candle-down'],
  modal: ['--kairos-surface-modal', '--kairos-background-overlay', '--kairos-border-default', '--kairos-text-primary'],
  warning: ['--kairos-state-warning'],
  disabled: ['--kairos-state-disabled', '--kairos-text-disabled'],
  selected: ['--kairos-border-active', '--kairos-accent-primary'],
  focus: ['--kairos-state-focus'],
  loading: ['--kairos-accent-primary', '--kairos-text-muted'],
});

const forbiddenGeometryPrefixes = [
  '--kairos-spacing-', '--kairos-radius-', '--kairos-control-', '--kairos-page-',
  '--kairos-card-gap', '--kairos-chart-min-', '--kairos-navigation-', '--kairos-motion-',
] as const;

export type ThemeCanaryResult = Readonly<{
  themeId: ThemeId;
  missingTokens: readonly string[];
  forbiddenGeometryTokens: readonly string[];
  passes: boolean;
}>;

export function evaluateThemeCanary(themeId: ThemeId): ThemeCanaryResult {
  const tokens = themeRegistry[themeId].tokens;
  const required = new Set(Object.values(themeCanaryTokenContract).flat());
  const missingTokens = [...required].filter((token) => !(token in tokens));
  const forbiddenGeometryTokens = Object.keys(tokens).filter((token) =>
    forbiddenGeometryPrefixes.some((prefix) => token.startsWith(prefix)),
  );
  return Object.freeze({
    themeId,
    missingTokens: Object.freeze(missingTokens),
    forbiddenGeometryTokens: Object.freeze(forbiddenGeometryTokens),
    passes: missingTokens.length === 0 && forbiddenGeometryTokens.length === 0,
  });
}

export function evaluateActiveThemeMatrix(): readonly ThemeCanaryResult[] {
  return Object.freeze(themeIds.map(evaluateThemeCanary));
}
