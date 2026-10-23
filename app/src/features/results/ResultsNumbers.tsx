import { useId, type ReactNode } from 'react';
import { PERIOD_PICTURE_STEPS, projectPeriodPictures } from '../../application/performance/periodPictures';
import {
  describeAverageTime,
  describeAverageTimesRisked,
  describeAverageUnavailable,
  describeBiggestDip,
  describePeriodMoneyUnavailable,
  describeProfitFactor,
  describeStreakLength,
  describeTradeCount,
  describeWonLost,
  type PeriodMoneyContext,
} from '../../application/performance/periodWords';
import type { PerformanceMoney, PerformanceSummary, PerformanceTrade } from '../../application/performance/performanceSummary';
import { decimalCompare } from '../../domain/calculations/decimalKernel';
import { Icon } from '../../design-system/icons/Icon';
import { ResultText, StatTile } from '../../design-system/primitives';
import { GlossaryHint } from '../learn/GlossaryHint';
import './results.css';

export interface ResultsNumbersProps {
  readonly summary: PerformanceSummary;
  readonly context: PeriodMoneyContext;
  readonly renderTradeLink: (id: string) => ReactNode;
}

const OUTCOME_WORDS = Object.freeze({ profit: 'Profit', loss: 'Loss', breakeven: 'Break-even' } as const);

/** A bar's length on screen; steps are for drawing only (D202). */
const width = (steps: number): string => `${(steps * 100) / PERIOD_PICTURE_STEPS}%`;
/** D189: the count behind a number; nothing when no trade gives it, as the words already say so. */
const countOf = (count: number): string | undefined => (count > 0 ? describeTradeCount(count) : undefined);
function Count({ count }: { readonly count: number }) {
  const words = countOf(count);
  return words === undefined ? null : <span className="kairos-results-numbers__count">{words}</span>;
}

/** The owner's amount with its shape and sign; the outcome follows the number shown, never a new sum. */
function Amount({ amount, currency }: { readonly amount: string; readonly currency: string }) {
  const sign = decimalCompare(amount, '0');
  const outcome = sign === null ? 'unavailable' : sign > 0 ? 'profit' : sign < 0 ? 'loss' : 'breakeven';
  return <ResultText outcome={outcome} label={outcome === 'unavailable' ? 'Not available' : OUTCOME_WORDS[outcome]} amount={outcome === 'unavailable' ? null : amount} currency={currency} showLabel={false} />;
}

/** "Not available" with its shape, and why in small words, as "Result after fees" says it. */
function NotAvailable({ why }: { readonly why: string }) {
  return <><ResultText outcome="unavailable" label="Not available" amount={null} /> <span className="kairos-results-numbers__why">{why}</span></>;
}

/** An average, or why it is missing. With no trade that has a result yet, no average can say there was no win or no loss. */
function moneyValue(money: PerformanceMoney, which: 'win' | 'loss' | 'result', context: PeriodMoneyContext, noResultYet: boolean): ReactNode {
  if (money.available) return <><Amount amount={money.shown} currency={money.currency} /> <Count count={money.tradeCount} /></>;
  if (money.reason === 'no-trades') return describeAverageUnavailable(noResultYet ? 'result' : which, money.reason, context);
  return <NotAvailable why={describeAverageUnavailable(which, money.reason, context)} />;
}

/** A tile's value and hint: the count under a number, the reason under "Not available" (as "Result after fees"). */
function tile(available: boolean, value: ReactNode, count: number, why: string): Readonly<{ value: ReactNode; hint: string | undefined }> {
  return available ? { value, hint: countOf(count) } : { value: <ResultText outcome="unavailable" label="Not available" amount={null} />, hint: why };
}

function tradeValue(trade: PerformanceTrade, renderTradeLink: (id: string) => ReactNode): ReactNode {
  if (!trade.available) return null;
  return <>
    <Amount amount={trade.amount} currency={trade.currency} />{' '}
    <span className="kairos-results-numbers__symbol">{trade.symbol}</span>{' '}
    {renderTradeLink(trade.tradeId)}
  </>;
}

/** U5 (P13.A4, D189, D202): the period numbers as pictures, each with its count. Every size and word comes from its owner; this draws only. */
export function ResultsNumbers({ summary, context, renderTradeLink }: ResultsNumbersProps) {
  const titleId = useId();
  const pictures = projectPeriodPictures(summary);
  const { outcomeBar, winLoss, timesRisked } = pictures;
  const { averageWin, averageLoss, averageResult, profitFactor, bestTrade, worstTrade, biggestDip } = summary;
  const wonLost = describeWonLost(summary.outcomes);
  const noResultYet = summary.outcomes.resultCount === 0;
  const tradeWhy = (trade: PerformanceTrade) => (trade.available ? '' : describePeriodMoneyUnavailable(trade.reason, context));
  const best = tile(bestTrade.available, tradeValue(bestTrade, renderTradeLink), bestTrade.tradeCount, tradeWhy(bestTrade));
  const worst = tile(worstTrade.available, tradeValue(worstTrade, renderTradeLink), worstTrade.tradeCount, tradeWhy(worstTrade));
  const dip = tile(biggestDip.available, describeBiggestDip(biggestDip, context), biggestDip.tradeCount, describeBiggestDip(biggestDip, context));
  const profitFactorWords = describeProfitFactor(profitFactor, context);
  const profitFactorShown = profitFactor.available || profitFactor.reason === 'no-losses' || profitFactor.reason === 'no-trades';
  return <section className="kairos-results-numbers" aria-labelledby={titleId}>
    <h3 id={titleId}>Your numbers</h3>

    {outcomeBar !== null ? <div className="kairos-results-numbers__block" data-number="won-lost">
      <p className="kairos-results-numbers__label">Share of trades won <GlossaryHint termId="share-won" label="Share of trades won" /></p>
      <div className="kairos-results-numbers__bar" role="img" aria-label={wonLost}>
        {outcomeBar.steps.won > 0 ? <span data-part="won" style={{ inlineSize: width(outcomeBar.steps.won) }} /> : null}
        {outcomeBar.steps.lost > 0 ? <span data-part="lost" style={{ inlineSize: width(outcomeBar.steps.lost) }} /> : null}
        {outcomeBar.steps.breakEven > 0 ? <span data-part="breakEven" style={{ inlineSize: width(outcomeBar.steps.breakEven) }} /> : null}
        {outcomeBar.steps.noResult > 0 ? <span data-part="noResult" style={{ inlineSize: width(outcomeBar.steps.noResult) }} /> : null}
      </div>
      <p>{wonLost}</p>
      <ul className="kairos-results-numbers__legend">
        <li data-key="won"><span className="kairos-results-numbers__swatch" /><Icon name="result-up" size={16} /> Won</li>
        <li data-key="lost"><span className="kairos-results-numbers__swatch" /><Icon name="result-down" size={16} /> Lost</li>
        <li data-key="breakEven"><span className="kairos-results-numbers__swatch" /><Icon name="result-flat" size={16} /> Break-even</li>
        <li data-key="noResult"><span className="kairos-results-numbers__swatch" /><Icon name="result-unknown" size={16} /> No result yet</li>
      </ul>
    </div> : null}

    <div className="kairos-results-numbers__block" data-number="win-loss">
      <div className="kairos-results-numbers__row" data-number="average-win">
        <p className="kairos-results-numbers__label">Average win {moneyValue(averageWin, 'win', context, noResultYet)}</p>
        {winLoss.available ? <div className="kairos-results-numbers__bar" aria-hidden="true"><span data-part="won" style={{ inlineSize: width(winLoss.winSteps) }} /></div> : null}
      </div>
      <div className="kairos-results-numbers__row" data-number="average-loss">
        <p className="kairos-results-numbers__label">Average loss {moneyValue(averageLoss, 'loss', context, noResultYet)}</p>
        {winLoss.available ? <div className="kairos-results-numbers__bar" aria-hidden="true"><span data-part="lost" style={{ inlineSize: width(winLoss.lossSteps) }} /></div> : null}
      </div>
      <p data-number="profit-factor">{profitFactorShown ? profitFactorWords : <>For every 1 you lost: <NotAvailable why={profitFactorWords} /></>} <GlossaryHint termId="for-every-1-you-lost" label="For every 1 you lost" /></p>
      <p data-number="average-result">Average result per trade {moneyValue(averageResult, 'result', context, noResultYet)} <GlossaryHint termId="average-result-per-trade" label="Average result per trade" /></p>
    </div>

    <div className="kairos-results-numbers__block" data-number="times-risked">
      <p>{describeAverageTimesRisked(summary.averageTimesRisked)} <Count count={summary.averageTimesRisked.tradeCount} /> <GlossaryHint termId="times-what-you-risked" label="× what you risked" /></p>
      {/* The sentence above says it; the picture is for the eye only. */}
      {timesRisked.available ? <div className="kairos-results-numbers__risk" aria-hidden="true">
        <span className="kairos-results-numbers__risk-label">1× what you risk</span>
        <span className="kairos-results-numbers__risk-bar"><span data-part="one-risk" style={{ inlineSize: width(timesRisked.oneRiskSteps) }} /></span>
        <span className="kairos-results-numbers__risk-label">Your average</span>
        <span className="kairos-results-numbers__risk-bar"><span data-part="average-risk" data-direction={timesRisked.direction} style={{ inlineSize: width(timesRisked.valueSteps) }} /></span>
      </div> : null}
    </div>

    <dl className="kairos-stat-grid">
      <StatTile label="Best trade" value={best.value} hint={best.hint} />
      <StatTile label="Worst trade" value={worst.value} hint={worst.hint} />
      <StatTile label="Biggest dip" value={<>{dip.value} <GlossaryHint termId="biggest-dip" label="Biggest dip" /></>} hint={dip.hint} />
      <StatTile label="Average time in a trade" value={describeAverageTime(summary.averageTime)} hint={countOf(summary.averageTime.tradeCount)} />
      <StatTile label="Most wins in a row" value={describeStreakLength(summary.longestWinStreak)} hint={countOf(summary.longestWinStreak.tradeCount)} />
      <StatTile label="Most losses in a row" value={describeStreakLength(summary.longestLossStreak)} hint={countOf(summary.longestLossStreak.tradeCount)} />
    </dl>
  </section>;
}
