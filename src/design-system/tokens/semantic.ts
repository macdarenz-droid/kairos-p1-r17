const role = (name: string) => `var(--kairos-${name})` as const;

export const semanticTokens = Object.freeze({
  background: Object.freeze({ base: role('background-base'), depth: role('background-depth'), overlay: role('background-overlay') }),
  surface: Object.freeze({ card: role('surface-card'), raised: role('surface-raised'), input: role('surface-input'), modal: role('surface-modal') }),
  border: Object.freeze({ default: role('border-default'), subtle: role('border-subtle'), active: role('border-active') }),
  text: Object.freeze({ primary: role('text-primary'), secondary: role('text-secondary'), muted: role('text-muted'), disabled: role('text-disabled') }),
  accent: Object.freeze({ primary: role('accent-primary'), secondary: role('accent-secondary'), soft: role('accent-soft'), glow: role('accent-glow') }),
  trade: Object.freeze({ profit: role('trade-profit'), loss: role('trade-loss'), flat: role('trade-flat'), long: role('trade-long'), short: role('trade-short'), entry: role('trade-entry'), stop: role('trade-stop'), target: role('trade-target'), riskZone: role('trade-risk-zone'), rewardZone: role('trade-reward-zone') }),
  chart: Object.freeze({ background: role('chart-background'), grid: role('chart-grid'), axis: role('chart-axis'), crosshair: role('chart-crosshair'), candleUp: role('chart-candle-up'), candleDown: role('chart-candle-down'), wickUp: role('chart-wick-up'), wickDown: role('chart-wick-down'), volumeUp: role('chart-volume-up'), volumeDown: role('chart-volume-down'), drawingPrimary: role('chart-drawing-primary'), drawingSecondary: role('chart-drawing-secondary'), support: role('chart-support'), resistance: role('chart-resistance') }),
  state: Object.freeze({ success: role('state-success'), warning: role('state-warning'), error: role('state-error'), info: role('state-info'), focus: role('state-focus'), hover: role('state-hover'), pressed: role('state-pressed'), disabled: role('state-disabled') }),
  glow: Object.freeze({ none: role('glow-none'), subtle: role('glow-subtle'), active: role('glow-active'), emphasis: role('glow-emphasis') }),
});

export type SemanticTokens = typeof semanticTokens;
