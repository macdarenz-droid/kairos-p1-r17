export const themeIds = ['ink', 'paper', 'kairos-depth', 'cosmic', 'ocean'] as const;
export type ThemeId = (typeof themeIds)[number];
export type ThemePreference = ThemeId | 'system';
/** Kairos Depth in the vision colours is the default look (DECISIONS D5); a saved choice still wins. */
export const defaultThemeId: ThemeId = 'kairos-depth';

export type ThemeDefinition = Readonly<{
  id: ThemeId;
  /** Plain name shown in the theme picker. */
  label: string;
  colorScheme: 'dark' | 'light';
  tokens: Readonly<Record<string, string>>;
}>;

type ThemeTokenMap = Readonly<Record<string, string>>;

// Vision colours (D5): Depth Black base, the Navy Layer as the card layer and a lighter navy raised layer (D172), Cyan primary, Violet secondary.
const kairosDepthTokens: ThemeTokenMap = {
  // Stable instrument identity, independent of price direction and active theme.
  '--kairos-bubble-identity-btc': '#ffc65c', '--kairos-bubble-identity-eth': '#9be7ff',
  // Approved V5 decorative rim palette; cosmic and ocean inherit the same glass artwork identity.
  '--kairos-bubble-smoke-1': '#5adfff85', '--kairos-bubble-smoke-2': '#9366e94d', '--kairos-bubble-smoke-3': '#46dfff6b', '--kairos-bubble-smoke-4': '#b879ff66',
  '--kairos-background-base': '#0b0d14', '--kairos-background-depth': '#03060b', '--kairos-background-overlay': 'rgba(0,0,0,.72)',
  '--kairos-surface-card': '#131a2e', '--kairos-surface-raised': '#1b2440', '--kairos-surface-input': '#0b0d14', '--kairos-surface-modal': '#18213a',
  '--kairos-border-default': '#26384a', '--kairos-border-subtle': '#182838', '--kairos-border-active': '#35d6ff',
  '--kairos-text-primary': '#f2f8fb', '--kairos-text-secondary': '#b5c7d1', '--kairos-text-muted': '#7f96a3', '--kairos-text-disabled': '#526572',
  '--kairos-accent-primary': '#35d6ff', '--kairos-accent-secondary': '#9b6bff', '--kairos-accent-soft': '#102b38', '--kairos-accent-glow': 'rgba(53,214,255,.30)',
  '--kairos-trade-profit': '#45d7a7', '--kairos-trade-loss': '#ff6f87', '--kairos-trade-flat': '#9aaab4', '--kairos-trade-long': '#45d7a7', '--kairos-trade-short': '#ff6f87', '--kairos-trade-entry': '#63b7ff', '--kairos-trade-stop': '#ff6f87', '--kairos-trade-target': '#45d7a7', '--kairos-trade-risk-zone': 'rgba(255,111,135,.18)', '--kairos-trade-reward-zone': 'rgba(69,215,167,.18)',
  '--kairos-chart-background': '#080e17', '--kairos-chart-grid': '#172635', '--kairos-chart-axis': '#849aa7', '--kairos-chart-crosshair': '#b0c2cc', '--kairos-chart-candle-up': '#45d7a7', '--kairos-chart-candle-down': '#ff6f87', '--kairos-chart-wick-up': '#45d7a7', '--kairos-chart-wick-down': '#ff6f87', '--kairos-chart-volume-up': 'rgba(69,215,167,.42)', '--kairos-chart-volume-down': 'rgba(255,111,135,.42)', '--kairos-chart-drawing-primary': '#35d6ff', '--kairos-chart-drawing-secondary': '#9b6bff', '--kairos-chart-support': '#45d7a7', '--kairos-chart-resistance': '#ff6f87',
  '--kairos-state-success': '#45d7a7', '--kairos-state-warning': '#f4c65b', '--kairos-state-error': '#ff6f87', '--kairos-state-info': '#63b7ff', '--kairos-state-focus': '#d5f6ff', '--kairos-state-hover': 'rgba(255,255,255,.07)', '--kairos-state-pressed': 'rgba(255,255,255,.12)', '--kairos-state-disabled': '#526572',
  '--kairos-glow-none': 'none', '--kairos-glow-subtle': '0 0 12px rgba(53,214,255,.13)', '--kairos-glow-active': '0 0 18px rgba(53,214,255,.24)', '--kairos-glow-emphasis': '0 0 28px rgba(155,107,255,.30)',
  // Ink registry amendment: hairline/strong borders, gradients and accent ink are part of every theme's contract.
  '--kairos-border-hairline': 'rgba(140,190,235,.16)', '--kairos-border-strong': '#26384a', '--kairos-accent-ink': '#03060b',
  '--kairos-background-gradient': 'radial-gradient(circle at top, #131a2e33, transparent 34rem), linear-gradient(180deg, #0b0d14, #0b0d14)',
  '--kairos-surface-gradient': 'linear-gradient(180deg, #172039, #131a2e)', '--kairos-field-gradient': 'linear-gradient(180deg, #10162a, #0b0d14)',
  // U3 (T-049a): the field edge (3:1, WCAG 1.4.11), the insight colour and three elevation shadows are part of every theme's contract.
  '--kairos-border-field': '#62809c', '--kairos-accent-insight': '#b08cff',
  '--kairos-elevation-1': '0 1px 0 rgba(255,255,255,.04) inset, 0 10px 28px rgba(0,0,0,.42)', '--kairos-elevation-2': '0 1px 0 rgba(255,255,255,.05) inset, 0 16px 40px rgba(0,0,0,.5)', '--kairos-elevation-3': '0 24px 64px rgba(0,0,0,.6)',  '--kairos-bubble-art-filter': 'none', '--kairos-bubble-art-opacity': '1', '--kairos-bubble-glass': 'none', '--kairos-bubble-border': 'transparent', '--kairos-bubble-ring-up': 'transparent', '--kairos-bubble-ring-down': 'transparent', '--kairos-bubble-shadow': 'none', '--kairos-bubble-fallback-opacity': '.8',
};

const cosmicTokens: ThemeTokenMap = {
  ...kairosDepthTokens,
  '--kairos-background-base': '#090716', '--kairos-background-depth': '#04030b', '--kairos-surface-card': '#1b1535', '--kairos-surface-raised': '#241c48', '--kairos-surface-input': '#0e0b21', '--kairos-surface-modal': '#201941',
  '--kairos-border-default': '#3c3158', '--kairos-border-subtle': '#2a2141', '--kairos-border-active': '#a98cff',
  '--kairos-text-primary': '#f7f3ff', '--kairos-text-secondary': '#c9bee3', '--kairos-text-muted': '#9588b2', '--kairos-text-disabled': '#645a7c',
  '--kairos-accent-primary': '#a98cff', '--kairos-accent-secondary': '#66b8ff', '--kairos-accent-soft': '#281c4b', '--kairos-accent-glow': 'rgba(169,140,255,.34)',
  '--kairos-chart-background': '#0b0818', '--kairos-chart-grid': '#28203e', '--kairos-chart-axis': '#a195ba', '--kairos-chart-crosshair': '#c9bfe0', '--kairos-chart-drawing-primary': '#a98cff', '--kairos-chart-drawing-secondary': '#66b8ff',
  '--kairos-state-info': '#66b8ff', '--kairos-state-focus': '#efe7ff',
  '--kairos-glow-subtle': '0 0 12px rgba(169,140,255,.15)', '--kairos-glow-active': '0 0 18px rgba(169,140,255,.28)', '--kairos-glow-emphasis': '0 0 30px rgba(102,184,255,.30)',
  '--kairos-border-hairline': 'rgba(190,160,255,.16)', '--kairos-border-strong': '#3c3158', '--kairos-accent-ink': '#04030b',
  '--kairos-background-gradient': 'radial-gradient(circle at top, #281c4b33, transparent 34rem), linear-gradient(180deg, #090716, #04030b)',
  '--kairos-surface-gradient': 'linear-gradient(180deg, #211a40, #1b1535)', '--kairos-field-gradient': 'linear-gradient(180deg, #15102c, #0e0b21)',
  '--kairos-border-field': '#7f70b4', '--kairos-accent-insight': '#66b8ff',  '--kairos-bubble-art-filter': 'none', '--kairos-bubble-art-opacity': '1', '--kairos-bubble-glass': 'none', '--kairos-bubble-border': 'transparent', '--kairos-bubble-ring-up': 'transparent', '--kairos-bubble-ring-down': 'transparent', '--kairos-bubble-shadow': 'none', '--kairos-bubble-fallback-opacity': '.8',
};

const oceanTokens: ThemeTokenMap = {
  ...kairosDepthTokens,
  '--kairos-background-base': '#031015', '--kairos-background-depth': '#02080b', '--kairos-surface-card': '#0b232c', '--kairos-surface-raised': '#11303a', '--kairos-surface-input': '#05151a', '--kairos-surface-modal': '#0f2b34',
  '--kairos-border-default': '#1d4850', '--kairos-border-subtle': '#12343b', '--kairos-border-active': '#4ee6d1',
  '--kairos-text-primary': '#effcfb', '--kairos-text-secondary': '#afd3d0', '--kairos-text-muted': '#7ca7a4', '--kairos-text-disabled': '#4d7472',
  '--kairos-accent-primary': '#4ee6d1', '--kairos-accent-secondary': '#55bfff', '--kairos-accent-soft': '#0c3738', '--kairos-accent-glow': 'rgba(78,230,209,.30)',
  '--kairos-chart-background': '#041419', '--kairos-chart-grid': '#12343b', '--kairos-chart-axis': '#82aaa7', '--kairos-chart-crosshair': '#b2d3d0', '--kairos-chart-drawing-primary': '#4ee6d1', '--kairos-chart-drawing-secondary': '#55bfff',
  '--kairos-state-info': '#55bfff', '--kairos-state-focus': '#d7fffa',
  '--kairos-glow-subtle': '0 0 12px rgba(78,230,209,.13)', '--kairos-glow-active': '0 0 18px rgba(78,230,209,.25)', '--kairos-glow-emphasis': '0 0 28px rgba(85,191,255,.28)',
  '--kairos-border-hairline': 'rgba(120,230,215,.16)', '--kairos-border-strong': '#1d4850', '--kairos-accent-ink': '#02080b',
  '--kairos-background-gradient': 'radial-gradient(circle at top, #0c373833, transparent 34rem), linear-gradient(180deg, #031015, #02080b)',
  '--kairos-surface-gradient': 'linear-gradient(180deg, #0f2a34, #0b232c)', '--kairos-field-gradient': 'linear-gradient(180deg, #08191f, #05151a)',
  '--kairos-border-field': '#4d878d', '--kairos-accent-insight': '#55bfff',  '--kairos-bubble-art-filter': 'none', '--kairos-bubble-art-opacity': '1', '--kairos-bubble-glass': 'none', '--kairos-bubble-border': 'transparent', '--kairos-bubble-ring-up': 'transparent', '--kairos-bubble-ring-down': 'transparent', '--kairos-bubble-shadow': 'none', '--kairos-bubble-fallback-opacity': '.8',
};


// Ink — approved 17 September 2026 as the default theme. Near-black canvas, four surface
// steps, hairline borders, one accent, no glow. Profit/loss are the only other chroma.
const inkTokens: ThemeTokenMap = {
  '--kairos-bubble-identity-btc': '#f5b544', '--kairos-bubble-identity-eth': '#9db7ff',
  '--kairos-bubble-smoke-1': 'transparent', '--kairos-bubble-smoke-2': 'transparent', '--kairos-bubble-smoke-3': 'transparent', '--kairos-bubble-smoke-4': 'transparent',
  '--kairos-background-base': '#08090b', '--kairos-background-depth': '#07080a', '--kairos-background-overlay': 'rgba(4,5,7,.6)',
  '--kairos-surface-card': '#0d0f13', '--kairos-surface-raised': '#13161c', '--kairos-surface-input': '#0d0f13', '--kairos-surface-modal': '#13161c',
  '--kairos-border-default': 'rgba(255,255,255,.14)', '--kairos-border-subtle': 'rgba(255,255,255,.08)', '--kairos-border-active': '#7d86ff',
  '--kairos-text-primary': '#f3f4f6', '--kairos-text-secondary': '#a1a7b3', '--kairos-text-muted': '#7a8190', '--kairos-text-disabled': '#4b515d',
  '--kairos-accent-primary': '#7d86ff', '--kairos-accent-secondary': '#a3aaff', '--kairos-accent-soft': 'rgba(125,134,255,.12)', '--kairos-accent-glow': 'transparent',
  '--kairos-trade-profit': '#3ecf8e', '--kairos-trade-loss': '#f0616d', '--kairos-trade-flat': '#8a919e', '--kairos-trade-long': '#3ecf8e', '--kairos-trade-short': '#f0616d', '--kairos-trade-entry': '#7d86ff', '--kairos-trade-stop': '#f0616d', '--kairos-trade-target': '#3ecf8e', '--kairos-trade-risk-zone': 'rgba(240,97,109,.14)', '--kairos-trade-reward-zone': 'rgba(62,207,142,.14)',
  '--kairos-chart-background': '#0d0f13', '--kairos-chart-grid': 'rgba(255,255,255,.06)', '--kairos-chart-axis': '#7a8190', '--kairos-chart-crosshair': '#7d86ff', '--kairos-chart-candle-up': '#3ecf8e', '--kairos-chart-candle-down': '#f0616d', '--kairos-chart-wick-up': '#3ecf8e', '--kairos-chart-wick-down': '#f0616d', '--kairos-chart-volume-up': 'rgba(62,207,142,.35)', '--kairos-chart-volume-down': 'rgba(240,97,109,.35)', '--kairos-chart-drawing-primary': '#7d86ff', '--kairos-chart-drawing-secondary': '#a3aaff', '--kairos-chart-support': '#3ecf8e', '--kairos-chart-resistance': '#f0616d',
  '--kairos-state-success': '#3ecf8e', '--kairos-state-warning': '#e5b04a', '--kairos-state-error': '#f0616d', '--kairos-state-info': '#7d86ff', '--kairos-state-focus': '#7d86ff', '--kairos-state-hover': 'rgba(255,255,255,.05)', '--kairos-state-pressed': 'rgba(255,255,255,.09)', '--kairos-state-disabled': '#4b515d',
  '--kairos-glow-none': 'none', '--kairos-glow-subtle': 'none', '--kairos-glow-active': 'none', '--kairos-glow-emphasis': 'none',
  '--kairos-border-hairline': 'rgba(255,255,255,.08)', '--kairos-border-strong': 'rgba(255,255,255,.14)', '--kairos-accent-ink': '#0a0b10',
  '--kairos-border-field': '#646c7d', '--kairos-accent-insight': '#7d86ff',
  '--kairos-elevation-1': '0 1px 2px rgba(0,0,0,.4)', '--kairos-elevation-2': '0 8px 24px rgba(0,0,0,.45)', '--kairos-elevation-3': '0 16px 48px rgba(0,0,0,.55)',
  '--kairos-background-gradient': 'radial-gradient(90% 42% at 50% -8%, rgba(125,134,255,.16), transparent 70%), radial-gradient(60% 36% at 100% 104%, rgba(62,207,142,.07), transparent 65%), linear-gradient(180deg, #0c0e15 0%, #08090b 55%, #07080a 100%)',
  '--kairos-surface-gradient': 'linear-gradient(180deg, #13161c, #0d0f13)',
  '--kairos-field-gradient': 'radial-gradient(80% 55% at 50% 0%, rgba(125,134,255,.10), transparent 60%), linear-gradient(180deg, #0d0f13, #08090b)',  '--kairos-bubble-art-filter': 'grayscale(1) contrast(.9)', '--kairos-bubble-art-opacity': '.28', '--kairos-bubble-glass': 'radial-gradient(circle at 30% 26%, rgba(255,255,255,.12), rgba(255,255,255,.025) 55%, rgba(255,255,255,0) 75%), linear-gradient(180deg, #13161c, #0d0f13)', '--kairos-bubble-border': 'rgba(255,255,255,.14)', '--kairos-bubble-ring-up': 'rgba(62,207,142,.45)', '--kairos-bubble-ring-down': 'rgba(240,97,109,.45)', '--kairos-bubble-shadow': '0 10px 30px rgba(0,0,0,.25)', '--kairos-bubble-fallback-opacity': '0',
};

// Paper — the first light theme; the same structure on a white ground.
const paperTokens: ThemeTokenMap = {
  ...inkTokens,
  '--kairos-bubble-identity-btc': '#c98a1a', '--kairos-bubble-identity-eth': '#4f74d9',
  '--kairos-background-base': '#fafafa', '--kairos-background-depth': '#f1f1f4', '--kairos-background-overlay': 'rgba(17,17,20,.35)',
  '--kairos-surface-card': '#ffffff', '--kairos-surface-raised': '#f4f4f5', '--kairos-surface-input': '#ffffff', '--kairos-surface-modal': '#ffffff',
  '--kairos-border-default': 'rgba(17,17,20,.16)', '--kairos-border-subtle': 'rgba(17,17,20,.09)', '--kairos-border-active': '#5461cf',
  '--kairos-text-primary': '#111114', '--kairos-text-secondary': '#5b6070', '--kairos-text-muted': '#676c7a', '--kairos-text-disabled': '#b1b5bf',
  '--kairos-accent-primary': '#5461cf', '--kairos-accent-secondary': '#3c65d5', '--kairos-accent-soft': 'rgba(94,106,210,.10)',
  '--kairos-trade-profit': '#147b4d', '--kairos-trade-loss': '#cf2a37', '--kairos-trade-flat': '#686e7c', '--kairos-trade-long': '#147b4d', '--kairos-trade-short': '#cf2a37', '--kairos-trade-entry': '#5461cf', '--kairos-trade-stop': '#cf2a37', '--kairos-trade-target': '#147b4d', '--kairos-trade-risk-zone': 'rgba(217,67,79,.12)', '--kairos-trade-reward-zone': 'rgba(26,158,99,.12)',
  '--kairos-chart-background': '#ffffff', '--kairos-chart-grid': 'rgba(17,17,20,.07)', '--kairos-chart-axis': '#676c7a', '--kairos-chart-crosshair': '#5e6ad2', '--kairos-chart-candle-up': '#1a9e63', '--kairos-chart-candle-down': '#d9434f', '--kairos-chart-wick-up': '#1a9e63', '--kairos-chart-wick-down': '#d9434f', '--kairos-chart-volume-up': 'rgba(26,158,99,.30)', '--kairos-chart-volume-down': 'rgba(217,67,79,.30)', '--kairos-chart-drawing-primary': '#5e6ad2', '--kairos-chart-drawing-secondary': '#4f74d9', '--kairos-chart-support': '#1a9e63', '--kairos-chart-resistance': '#d9434f',
  '--kairos-state-success': '#147b4d', '--kairos-state-warning': '#946219', '--kairos-state-error': '#cf2a37', '--kairos-state-info': '#5461cf', '--kairos-state-focus': '#5461cf', '--kairos-state-hover': 'rgba(17,17,20,.04)', '--kairos-state-pressed': 'rgba(17,17,20,.08)', '--kairos-state-disabled': '#b1b5bf',
  '--kairos-border-hairline': 'rgba(17,17,20,.09)', '--kairos-border-strong': 'rgba(17,17,20,.16)', '--kairos-accent-ink': '#ffffff',
  '--kairos-border-field': '#7d8393', '--kairos-accent-insight': '#5461cf',
  '--kairos-elevation-1': '0 1px 2px rgba(17,17,20,.06), 0 4px 12px rgba(17,17,20,.05)', '--kairos-elevation-2': '0 8px 24px rgba(17,17,20,.10)', '--kairos-elevation-3': '0 16px 48px rgba(17,17,20,.16)',
  '--kairos-background-gradient': 'radial-gradient(90% 42% at 50% -8%, rgba(94,106,210,.14), transparent 70%), radial-gradient(60% 36% at 100% 104%, rgba(26,158,99,.07), transparent 65%), linear-gradient(180deg, #ffffff 0%, #f7f7f9 55%, #f1f1f4 100%)',
  '--kairos-surface-gradient': 'linear-gradient(180deg, #ffffff, #f4f4f5)',
  '--kairos-field-gradient': 'radial-gradient(80% 55% at 50% 0%, rgba(94,106,210,.09), transparent 60%), linear-gradient(180deg, #ffffff, #f4f4f5)',  '--kairos-bubble-art-filter': 'grayscale(1) contrast(.9)', '--kairos-bubble-art-opacity': '.14', '--kairos-bubble-glass': 'radial-gradient(circle at 30% 26%, rgba(255,255,255,.9), rgba(255,255,255,.35) 55%, rgba(255,255,255,0) 75%), linear-gradient(180deg, #ffffff, #f4f4f5)', '--kairos-bubble-border': 'rgba(17,17,20,.16)', '--kairos-bubble-ring-up': 'rgba(26,158,99,.45)', '--kairos-bubble-ring-down': 'rgba(217,67,79,.45)', '--kairos-bubble-shadow': '0 10px 30px rgba(17,17,20,.10)', '--kairos-bubble-fallback-opacity': '0',
};

export const themeRegistry: Readonly<Record<ThemeId, ThemeDefinition>> = Object.freeze({
  ink: Object.freeze({ id: 'ink', label: 'Ink', colorScheme: 'dark', tokens: Object.freeze(inkTokens) }),
  paper: Object.freeze({ id: 'paper', label: 'Paper', colorScheme: 'light', tokens: Object.freeze(paperTokens) }),
  'kairos-depth': Object.freeze({ id: 'kairos-depth', label: 'Kairos Depth', colorScheme: 'dark', tokens: Object.freeze(kairosDepthTokens) }),
  cosmic: Object.freeze({ id: 'cosmic', label: 'Cosmic', colorScheme: 'dark', tokens: Object.freeze(cosmicTokens) }),
  ocean: Object.freeze({ id: 'ocean', label: 'Ocean', colorScheme: 'dark', tokens: Object.freeze(oceanTokens) }),
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
