import { describe, expect, it } from 'vitest';
import { projectAnalysisSavedTradeRiskRewardRatio } from '../src/app/analysisSavedTradeRiskRewardRatioProjection';
import type { RiskRewardAnalysis } from '../src/application/risk-reward';
import type { DecimalString } from '../src/domain/trades';

const d = (value: string) => value as DecimalString;
const analysis = (side: RiskRewardAnalysis['side'], entry: string, stop: string, target: string): RiskRewardAnalysis =>
  Object.freeze({ id: 'rr-1', side, levels: Object.freeze({ entry: d(entry), stop: d(stop), target: d(target) }) });

describe('Analysis saved-trade Risk/Reward ratio projection', () => {
  it('projects the exact planned ratio and signed live R for a long through the released calculators', () => {
    const result = projectAnalysisSavedTradeRiskRewardRatio(analysis('long', '100', '95', '115'), d('107.5'));
    expect(result).toEqual({
      kind: 'ratio-ready',
      side: 'long',
      levels: { entry: '100', stop: '95', target: '115' },
      planned: { riskDistance: '5', rewardDistance: '15', ratio: '3' },
      live: { kind: 'live-r-ready', lastClose: '107.5', rMultiple: '1.5' },
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('signs live R by side: a short in profit reads positive, a long under water reads negative', () => {
    const short = projectAnalysisSavedTradeRiskRewardRatio(analysis('short', '2000', '2050', '1900'), d('1975'));
    expect(short.kind === 'ratio-ready' && short.planned).toEqual({ riskDistance: '50', rewardDistance: '100', ratio: '2' });
    expect(short.kind === 'ratio-ready' && short.live).toEqual({ kind: 'live-r-ready', lastClose: '1975', rMultiple: '0.5' });
    const long = projectAnalysisSavedTradeRiskRewardRatio(analysis('long', '10', '9', '12.5'), d('9.25'));
    expect(long.kind === 'ratio-ready' && long.live).toEqual({ kind: 'live-r-ready', lastClose: '9.25', rMultiple: '-0.75' });
  });

  it('keeps exact decimal precision instead of floating-point arithmetic', () => {
    const result = projectAnalysisSavedTradeRiskRewardRatio(analysis('long', '0.1', '0.07', '0.19'), d('0.13'));
    expect(result.kind === 'ratio-ready' && result.planned).toEqual({ riskDistance: '0.03', rewardDistance: '0.09', ratio: '3' });
    expect(result.kind === 'ratio-ready' && result.live).toEqual({ kind: 'live-r-ready', lastClose: '0.13', rMultiple: '1' });
  });

  it('reports the planned ratio with live R unavailable while no authoritative last close exists', () => {
    const result = projectAnalysisSavedTradeRiskRewardRatio(analysis('long', '100', '90', '130'), null);
    expect(result.kind === 'ratio-ready' && result.planned.ratio).toBe('3');
    expect(result.kind === 'ratio-ready' && result.live).toEqual({ kind: 'unavailable', reason: 'last-close-missing' });
  });

  it('fails closed on inverted or flat levels for the saved side', () => {
    expect(projectAnalysisSavedTradeRiskRewardRatio(analysis('long', '100', '105', '115'), null)).toEqual({ kind: 'unavailable', reason: 'levels-not-ordered' });
    expect(projectAnalysisSavedTradeRiskRewardRatio(analysis('long', '100', '95', '98'), null)).toEqual({ kind: 'unavailable', reason: 'levels-not-ordered' });
    expect(projectAnalysisSavedTradeRiskRewardRatio(analysis('short', '100', '95', '90'), null)).toEqual({ kind: 'unavailable', reason: 'levels-not-ordered' });
    expect(projectAnalysisSavedTradeRiskRewardRatio(analysis('long', '100', '100', '110'), null)).toEqual({ kind: 'unavailable', reason: 'levels-not-ordered' });
  });

  it('fails closed on invalid decimal evidence without touching the planned result', () => {
    expect(projectAnalysisSavedTradeRiskRewardRatio(analysis('long', 'abc', '95', '115'), null)).toEqual({ kind: 'unavailable', reason: 'invalid-decimal' });
    const result = projectAnalysisSavedTradeRiskRewardRatio(analysis('long', '100', '95', '115'), d('not-a-price'));
    expect(result.kind === 'ratio-ready' && result.planned.ratio).toBe('3');
    expect(result.kind === 'ratio-ready' && result.live).toEqual({ kind: 'unavailable', reason: 'invalid-decimal' });
  });
});
