import { calculatePercentage } from '../domain/calculations/percentageCalculator';
import type { DecimalString } from '../domain/trades';
import { formatHomeDashboardLiveCryptoBubbleMovement } from './homeDashboardGlassBubbleFormatting';
import type { AnalysisSavedTradeRiskRewardPresentationResult } from './analysisSavedTradeRiskRewardPresentationSession';
import type { AnalysisSavedTradeRiskRewardReferenceProjection } from './analysisSavedTradeRiskRewardReferenceProjection';
import { projectAnalysisSavedTradeRiskRewardRatio } from './analysisSavedTradeRiskRewardRatioProjection';
import { formatAnalysisSavedTradeRMultiple, formatAnalysisSavedTradeRatio } from './analysisSavedTradePositionBoxFormatting';

export interface AnalysisSavedTradeRiskRewardEvidencePresentationProps {
  readonly presentation: AnalysisSavedTradeRiskRewardPresentationResult | null;
  readonly lastError: unknown | null;
  readonly symbol: string;
  readonly quoteAsset: string;
  /** Caller-authoritative last close: the live projection's last rendered candle, or the authoritative page's last candle. */
  readonly lastClose: DecimalString | null;
  readonly lastCloseSource: 'live' | 'history' | null;
}

const unavailableDetail = (logical: Extract<AnalysisSavedTradeRiskRewardReferenceProjection, { kind: 'unavailable' }>): string => {
  switch (logical.reason) {
    case 'reference-unavailable': return 'This saved trade has no exact evidence for this chart’s symbol and price currency.';
    case 'planned-entry-missing': return 'The saved plan has no entry price.';
    case 'planned-stop-missing': return 'The saved plan has no stop price.';
    case 'planned-target-missing': return 'The saved plan has no target price.';
    case 'extent-invalid': return 'The authoritative candle history cannot place the plan yet.';
  }
};

const ratioDetail = (reason: 'invalid-decimal' | 'zero-risk-distance' | 'levels-not-ordered'): string => {
  switch (reason) {
    case 'levels-not-ordered': return 'Stop and target must sit on opposite sides of the entry for this side.';
    case 'zero-risk-distance': return 'Entry and stop are equal, so risk per unit is zero.';
    case 'invalid-decimal': return 'A saved level is not a valid decimal.';
  }
};

/** Percent of entry through the released percentage owner, shown through the released presentation-only rounding formatter; the row already carries the sign. */
const percentOfEntry = (distance: DecimalString, entry: DecimalString): string | null => {
  const percent = calculatePercentage(distance, entry);
  if (!percent.ok) return null;
  const formatted = formatHomeDashboardLiveCryptoBubbleMovement(percent.value, false);
  return formatted === 'Unavailable' ? null : formatted.replace(/^[+-]/, '');
};

/**
 * Accessible position box beside the chart: exact planned levels, reward and
 * risk distances, the planned ratio and the side-signed live R, all read from
 * the released Risk/Reward owners. Nothing here is written to the journal.
 */
export function AnalysisSavedTradeRiskRewardEvidencePresentation({
  presentation,
  lastError,
  symbol,
  quoteAsset,
  lastClose,
  lastCloseSource,
}: AnalysisSavedTradeRiskRewardEvidencePresentationProps) {
  const refreshAlert = lastError !== null
    ? <p role="alert">Saved trade Risk/Reward could not be refreshed. The last complete position box remains unchanged.</p>
    : null;

  if (presentation === null) {
    return <section className="kairos-position-box kairos-position-box--pending" aria-label="Saved trade position box">
      {refreshAlert ?? <p role="status" className="kairos-analysis-chart__note">Preparing the saved trade position box from authoritative candle history.</p>}
    </section>;
  }

  const logical = presentation.logical;
  if (logical.kind === 'unavailable') {
    return <section className="kairos-position-box kairos-position-box--unavailable" aria-label="Saved trade position box" data-saved-trade-risk-reward-evidence="unavailable">
      {refreshAlert}
      <div role="status">
        <strong>Position box unavailable</strong>
        <p className="kairos-analysis-chart__note">{unavailableDetail(logical)}</p>
      </div>
    </section>;
  }

  const ratio = projectAnalysisSavedTradeRiskRewardRatio(logical.analysis, lastClose);
  if (ratio.kind === 'unavailable') {
    return <section className="kairos-position-box kairos-position-box--unavailable" aria-label="Saved trade position box" data-saved-trade-risk-reward-evidence="unavailable">
      {refreshAlert}
      <div role="status">
        <strong>Position box unavailable</strong>
        <p className="kairos-analysis-chart__note">{ratioDetail(ratio.reason)}</p>
      </div>
    </section>;
  }

  const { levels, planned, live } = ratio;
  const rewardPercent = percentOfEntry(planned.rewardDistance, levels.entry);
  const riskPercent = percentOfEntry(planned.riskDistance, levels.entry);
  const sideLabel = ratio.side === 'long' ? 'Long' : 'Short';
  const liveReady = live.kind === 'live-r-ready';
  const liveTone = !liveReady ? 'none' : live.rMultiple.startsWith('-') ? 'loss' : live.rMultiple === '0' ? 'flat' : 'profit';

  return <section className="kairos-position-box" aria-label="Saved trade position box" data-saved-trade-risk-reward-evidence="ready" data-live-r={liveReady ? liveTone : 'unavailable'} data-live-r-exact={liveReady ? live.rMultiple : undefined} data-planned-ratio-exact={planned.ratio}>
    {refreshAlert}
    <div className="kairos-position-box__head" role="status">
      <strong className="kairos-position-box__side" data-side={ratio.side}>{sideLabel} <span>{symbol}</span></strong>
      {liveReady
        ? <strong className="kairos-position-box__r" data-tone={liveTone}>{formatAnalysisSavedTradeRMultiple(live.rMultiple)} R</strong>
        : <strong className="kairos-position-box__r" data-tone="planned">1 : {formatAnalysisSavedTradeRatio(planned.ratio)}</strong>}
    </div>
    <dl className="kairos-position-box__rows">
      <div className="kairos-position-box__row" data-role="reward">
        <dt>reward</dt>
        <dd>+{planned.rewardDistance}{rewardPercent === null ? '' : ` · ${rewardPercent}`}</dd>
      </div>
      <div className="kairos-position-box__row" data-role="risk">
        <dt>risk</dt>
        <dd>−{planned.riskDistance}{riskPercent === null ? '' : ` · ${riskPercent}`}</dd>
      </div>
      <div className="kairos-position-box__row" data-role="planned">
        <dt>planned</dt>
        <dd>1 : {formatAnalysisSavedTradeRatio(planned.ratio)}</dd>
      </div>
    </dl>
    <dl className="kairos-position-box__levels">
      <div><dt>Target</dt><dd>{levels.target}</dd></div>
      <div><dt>Entry</dt><dd>{levels.entry}</dd></div>
      <div><dt>Stop</dt><dd>{levels.stop}</dd></div>
    </dl>
    <p className="kairos-analysis-chart__note">
      {liveReady
        ? `Live R at ${live.lastClose} ${quoteAsset} · ${lastCloseSource === 'live' ? 'last rendered live candle' : 'last authoritative history candle'}. Prices in ${quoteAsset}. Nothing here is written to the journal.`
        : `Live R appears once a candle close is available. Prices in ${quoteAsset}. Nothing here is written to the journal.`}
    </p>
  </section>;
}
