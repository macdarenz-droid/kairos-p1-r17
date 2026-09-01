export const themeIds = ['kairos-depth', 'cosmic', 'ocean'] as const;
export type ThemeId = (typeof themeIds)[number];
export type ThemePreference = ThemeId | 'system';
export const defaultThemeId: ThemeId = 'kairos-depth';

export type ThemeDefinition = Readonly<{
  id: ThemeId;
  colorScheme: 'dark';
  tokens: Readonly<Record<string, string>>;
}>;

type ThemeTokenMap = Readonly<Record<string, string>>;

const kairosDepthTokens: ThemeTokenMap = {
  '--kairos-background-base': '#070b12', '--kairos-background-depth': '#03060b', '--kairos-background-overlay': 'rgba(0,0,0,.72)',
  '--kairos-surface-card': '#0d1420', '--kairos-surface-raised': '#121c2a', '--kairos-surface-input': '#09111b', '--kairos-surface-modal': '#101927',
  '--kairos-border-default': '#26384a', '--kairos-border-subtle': '#182838', '--kairos-border-active': '#59dcff',
  '--kairos-text-primary': '#f2f8fb', '--kairos-text-secondary': '#b5c7d1', '--kairos-text-muted': '#7f96a3', '--kairos-text-disabled': '#526572',
  '--kairos-accent-primary': '#59dcff', '--kairos-accent-secondary': '#8b7cff', '--kairos-accent-soft': '#102b38', '--kairos-accent-glow': 'rgba(89,220,255,.30)',
  '--kairos-trade-profit': '#45d7a7', '--kairos-trade-loss': '#ff6f87', '--kairos-trade-flat': '#9aaab4', '--kairos-trade-long': '#45d7a7', '--kairos-trade-short': '#ff6f87', '--kairos-trade-entry': '#63b7ff', '--kairos-trade-stop': '#ff6f87', '--kairos-trade-target': '#45d7a7', '--kairos-trade-risk-zone': 'rgba(255,111,135,.18)', '--kairos-trade-reward-zone': 'rgba(69,215,167,.18)',
  '--kairos-chart-background': '#080e17', '--kairos-chart-grid': '#172635', '--kairos-chart-axis': '#849aa7', '--kairos-chart-crosshair': '#b0c2cc', '--kairos-chart-candle-up': '#45d7a7', '--kairos-chart-candle-down': '#ff6f87', '--kairos-chart-wick-up': '#45d7a7', '--kairos-chart-wick-down': '#ff6f87', '--kairos-chart-volume-up': 'rgba(69,215,167,.42)', '--kairos-chart-volume-down': 'rgba(255,111,135,.42)', '--kairos-chart-drawing-primary': '#59dcff', '--kairos-chart-drawing-secondary': '#8b7cff', '--kairos-chart-support': '#45d7a7', '--kairos-chart-resistance': '#ff6f87',
  '--kairos-state-success': '#45d7a7', '--kairos-state-warning': '#f4c65b', '--kairos-state-error': '#ff6f87', '--kairos-state-info': '#63b7ff', '--kairos-state-focus': '#d5f6ff', '--kairos-state-hover': 'rgba(255,255,255,.07)', '--kairos-state-pressed': 'rgba(255,255,255,.12)', '--kairos-state-disabled': '#526572',
  '--kairos-glow-none': 'none', '--kairos-glow-subtle': '0 0 12px rgba(89,220,255,.13)', '--kairos-glow-active': '0 0 18px rgba(89,220,255,.24)', '--kairos-glow-emphasis': '0 0 28px rgba(139,124,255,.30)',
};

const cosmicTokens: ThemeTokenMap = {
  ...kairosDepthTokens,
  '--kairos-background-base': '#090716', '--kairos-background-depth': '#04030b', '--kairos-surface-card': '#141027', '--kairos-surface-raised': '#1b1533', '--kairos-surface-input': '#100c20', '--kairos-surface-modal': '#18122e',
  '--kairos-border-default': '#3c3158', '--kairos-border-subtle': '#2a2141', '--kairos-border-active': '#a98cff',
  '--kairos-text-primary': '#f7f3ff', '--kairos-text-secondary': '#c9bee3', '--kairos-text-muted': '#9588b2', '--kairos-text-disabled': '#645a7c',
  '--kairos-accent-primary': '#a98cff', '--kairos-accent-secondary': '#66b8ff', '--kairos-accent-soft': '#281c4b', '--kairos-accent-glow': 'rgba(169,140,255,.34)',
  '--kairos-chart-background': '#0b0818', '--kairos-chart-grid': '#28203e', '--kairos-chart-axis': '#a195ba', '--kairos-chart-crosshair': '#c9bfe0', '--kairos-chart-drawing-primary': '#a98cff', '--kairos-chart-drawing-secondary': '#66b8ff',
  '--kairos-state-info': '#66b8ff', '--kairos-state-focus': '#efe7ff',
  '--kairos-glow-subtle': '0 0 12px rgba(169,140,255,.15)', '--kairos-glow-active': '0 0 18px rgba(169,140,255,.28)', '--kairos-glow-emphasis': '0 0 30px rgba(102,184,255,.30)',
};

const oceanTokens: ThemeTokenMap = {
  ...kairosDepthTokens,
  '--kairos-background-base': '#031015', '--kairos-background-depth': '#02080b', '--kairos-surface-card': '#071a20', '--kairos-surface-raised': '#0b242b', '--kairos-surface-input': '#06161b', '--kairos-surface-modal': '#091f25',
  '--kairos-border-default': '#1d4850', '--kairos-border-subtle': '#12343b', '--kairos-border-active': '#4ee6d1',
  '--kairos-text-primary': '#effcfb', '--kairos-text-secondary': '#afd3d0', '--kairos-text-muted': '#7ca7a4', '--kairos-text-disabled': '#4d7472',
  '--kairos-accent-primary': '#4ee6d1', '--kairos-accent-secondary': '#55bfff', '--kairos-accent-soft': '#0c3738', '--kairos-accent-glow': 'rgba(78,230,209,.30)',
  '--kairos-chart-background': '#041419', '--kairos-chart-grid': '#12343b', '--kairos-chart-axis': '#82aaa7', '--kairos-chart-crosshair': '#b2d3d0', '--kairos-chart-drawing-primary': '#4ee6d1', '--kairos-chart-drawing-secondary': '#55bfff',
  '--kairos-state-info': '#55bfff', '--kairos-state-focus': '#d7fffa',
  '--kairos-glow-subtle': '0 0 12px rgba(78,230,209,.13)', '--kairos-glow-active': '0 0 18px rgba(78,230,209,.25)', '--kairos-glow-emphasis': '0 0 28px rgba(85,191,255,.28)',
};

export const themeRegistry: Readonly<Record<ThemeId, ThemeDefinition>> = Object.freeze({
  'kairos-depth': Object.freeze({ id: 'kairos-depth', colorScheme: 'dark', tokens: Object.freeze(kairosDepthTokens) }),
  cosmic: Object.freeze({ id: 'cosmic', colorScheme: 'dark', tokens: Object.freeze(cosmicTokens) }),
  ocean: Object.freeze({ id: 'ocean', colorScheme: 'dark', tokens: Object.freeze(oceanTokens) }),
});

export function resolveTheme(preference: ThemePreference, _systemDark: boolean): ThemeId {
  return preference === 'system' ? defaultThemeId : preference;
}

export function applyTheme(root: HTMLElement, themeId: ThemeId): void {
  const theme = themeRegistry[themeId];
  root.dataset.kairosTheme = theme.id;
  root.style.colorScheme = theme.colorScheme;
  for (const [property, value] of Object.entries(theme.tokens)) root.style.setProperty(property, value);
}
