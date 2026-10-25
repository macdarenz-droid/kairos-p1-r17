import { semanticTokens } from '../design-system/tokens/semantic';
import { themeRegistry, type ThemeId } from '../design-system/themes';
import type { AnalysisSavedTradeRiskRewardCanvasStyleSource } from './analysisSavedTradeRiskRewardCanvasPaneRenderer';

export const ANALYSIS_SAVED_TRADE_RISK_REWARD_LINE_WIDTH = 2;
export const ANALYSIS_SAVED_TRADE_RISK_REWARD_ZONE_OPACITY = 1;

const supportedTokenReferences = Object.freeze([
  semanticTokens.trade.entry,
  semanticTokens.trade.stop,
  semanticTokens.trade.target,
  semanticTokens.trade.riskZone,
  semanticTokens.trade.rewardZone,
]);

const tokenProperty = (reference: string): string | null => {
  if (!supportedTokenReferences.includes(reference as typeof supportedTokenReferences[number])) return null;
  return reference.slice(4, -1);
};

/**
 * Resolves only P19's released Risk/Reward semantic token references through
 * one exact P3 theme definition. The theme registry retains token-value
 * ownership; this adapter adds no DOM lookup, fallback colour or financial
 * meaning. Zone tokens already include their approved alpha, so Canvas global
 * opacity stays at one and does not attenuate them a second time.
 */
export function createAnalysisSavedTradeRiskRewardThemeStyleSource(
  themeId: ThemeId,
): AnalysisSavedTradeRiskRewardCanvasStyleSource {
  const theme = themeRegistry[themeId];
  if (!theme) throw new Error('analysis-saved-trade-risk-reward-theme-unavailable');

  return Object.freeze({
    lineWidth: ANALYSIS_SAVED_TRADE_RISK_REWARD_LINE_WIDTH,
    zoneOpacity: ANALYSIS_SAVED_TRADE_RISK_REWARD_ZONE_OPACITY,
    resolveToken(reference: string): string | null {
      const property = tokenProperty(reference);
      if (property === null) return null;
      const value = theme.tokens[property];
      return typeof value === 'string' && value.length > 0 ? value : null;
    },
  });
}
