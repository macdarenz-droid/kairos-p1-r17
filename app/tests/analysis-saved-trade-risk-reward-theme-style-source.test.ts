import { expect, it } from 'vitest';
import { semanticTokens } from '../src/design-system/tokens/semantic';
import { themeIds, themeRegistry, type ThemeId } from '../src/design-system/themes';
import {
  ANALYSIS_SAVED_TRADE_RISK_REWARD_LINE_WIDTH,
  ANALYSIS_SAVED_TRADE_RISK_REWARD_ZONE_OPACITY,
  createAnalysisSavedTradeRiskRewardThemeStyleSource,
} from '../src/app/analysisSavedTradeRiskRewardThemeStyleSource';

const references = Object.freeze([
  semanticTokens.trade.entry,
  semanticTokens.trade.stop,
  semanticTokens.trade.target,
  semanticTokens.trade.riskZone,
  semanticTokens.trade.rewardZone,
]);

it.each(themeIds)('resolves only exact released Risk/Reward tokens from the %s theme', themeId => {
  const source = createAnalysisSavedTradeRiskRewardThemeStyleSource(themeId);
  for (const reference of references) {
    expect(source.resolveToken(reference)).toBe(themeRegistry[themeId].tokens[reference.slice(4, -1)]);
  }
});

it('rejects unrelated, malformed and fallback token references without consulting the DOM', () => {
  const source = createAnalysisSavedTradeRiskRewardThemeStyleSource('kairos-depth');
  expect(source.resolveToken(semanticTokens.trade.profit)).toBeNull();
  expect(source.resolveToken('--kairos-trade-entry')).toBeNull();
  expect(source.resolveToken('var(--kairos-trade-entry, red)')).toBeNull();
  expect(source.resolveToken(' var(--kairos-trade-entry)')).toBeNull();
});

it('publishes immutable presentation policy without double-applying zone alpha', () => {
  const source = createAnalysisSavedTradeRiskRewardThemeStyleSource('cosmic');
  expect(source).toEqual(expect.objectContaining({
    lineWidth: ANALYSIS_SAVED_TRADE_RISK_REWARD_LINE_WIDTH,
    zoneOpacity: ANALYSIS_SAVED_TRADE_RISK_REWARD_ZONE_OPACITY,
  }));
  expect(source.lineWidth).toBe(2);
  expect(source.zoneOpacity).toBe(1);
  expect(Object.isFrozen(source)).toBe(true);
});

it('fails closed when runtime evidence names no registered theme', () => {
  expect(() => createAnalysisSavedTradeRiskRewardThemeStyleSource('missing' as ThemeId))
    .toThrow('analysis-saved-trade-risk-reward-theme-unavailable');
});
