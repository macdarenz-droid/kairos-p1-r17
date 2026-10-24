import { useEffect } from 'react';
import type { JournalHistoryEntry } from '../../application/journal';
import { CLOSED_PART_NEEDS_CONTRACT_SIZE_WORDS, describeClosedPart, describeMoneyAtRisk, describePointValue, NEEDS_CONTRACT_SIZE_WORDS } from '../../application/performance/performanceWords';
import { projectTradeClosedPart } from '../../application/performance/tradeClosedPart';
import { describeTimesRisked, projectTradeMoneyAtRisk, projectTradeTimesRisked } from '../../application/performance/tradeRisk';
import { latestTradePlan } from '../../application/trade-visualizer/tradeVisualizerFacts';
import { canAddTradeContractSize, type AddTradeContractSizeInput, type AddTradeContractSizeResult } from '../../application/trades';
import { resolveContractSize } from '../../domain/calculations/contractSize';
import type { TradeExecutionRecord, TradeFeeRecord, TradePlanRecord, TradeRecord } from '../../domain/trades';
import { ResultText } from '../../design-system/primitives';
import { AddContractSizeControl } from './AddContractSizeControl';

export function reviewTimestamp(value: string | null): string {
  if (value === null) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function amount(value: string | null | undefined, currency?: string | null): string {
  return value == null ? 'Not available' : currency ? `${value} ${currency}` : `${value} · Currency not recorded`;
}

function title(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }

export const reviewResultId = (tradeId: string): string => `kairos-review-result-${tradeId}`;

/** U11 (D237): adds a missing "how much one point is worth"; absent where the trade is read-only. */
export type AddContractSizePort = Readonly<{ save: (input: AddTradeContractSizeInput) => Promise<AddTradeContractSizeResult>; onSaved: () => Promise<void> | void }>;

/** The trade's own facts. `heading` is the section's title: the symbol in Analysis, "Details" on the trade's page. */
export function TradeOverview({ trade, heading = 'symbol' }: { readonly trade: TradeRecord; readonly heading?: 'symbol' | 'details' }) {
  const pointValue = describePointValue(resolveContractSize(trade), trade.grossPnlCurrency || null);
  return <section className="kairos-review__card" aria-label="Trade overview">
    {heading === 'symbol'
      ? <div className="kairos-review__topline"><h2>{trade.symbol}</h2><span>{title(trade.side)} · {title(trade.status)}</span></div>
      : <h2>Details</h2>}
    <dl className="kairos-review__facts">
      <div><dt>Market</dt><dd>{title(trade.marketType)}</dd></div><div><dt>Source</dt><dd>{title(trade.source)}</dd></div>
      <div><dt>Price currency</dt><dd>{trade.grossPnlCurrency || 'Not recorded'}</dd></div>
      {pointValue !== null ? <div><dt>Each point is worth</dt><dd>{pointValue}</dd></div> : null}
      <div><dt>Where you traded</dt><dd>{trade.exchange || 'Not recorded'}</dd></div>
      <div><dt>Leverage</dt><dd>{trade.leverage ? `${trade.leverage}×` : 'Not recorded'}</dd></div>
      <div className="kairos-review__wide"><dt>Tags</dt><dd>{trade.tags?.length ? trade.tags.join(', ') : 'None'}</dd></div>
      <div><dt>Opened</dt><dd>{trade.openedAt ? <time dateTime={trade.openedAt}>{reviewTimestamp(trade.openedAt)}</time> : 'Not recorded'}</dd></div>
      <div><dt>Closed</dt><dd>{trade.closedAt ? <time dateTime={trade.closedAt}>{reviewTimestamp(trade.closedAt)}</time> : 'Not recorded'}</dd></div>
      <div><dt>Last updated</dt><dd><time dateTime={trade.updatedAt}>{reviewTimestamp(trade.updatedAt)}</time></dd></div>
    </dl>
  </section>;
}

/**
 * The trade's result: after fees, before fees, its fees in money, money at risk and × what you risked (U15, D260), each
 * from its owner. After a point value is added and the trade read again, the result takes focus once (`focusResult`).
 */
export function TradeResult({ entry, addContractSize, focusResult = false, onResultFocused }: {
  readonly entry: JournalHistoryEntry;
  readonly addContractSize?: AddContractSizePort;
  readonly focusResult?: boolean;
  readonly onResultFocused?: () => void;
}) {
  const { trade, executions, fees, metrics, visualPnl } = entry;
  const closedPart = projectTradeClosedPart(entry);
  const timesRisked = projectTradeTimesRisked(entry);
  // Only once the trade read again shows its point value: the result still showing the trade as it was waits.
  const hasPointValue = trade.contractSize != null;
  useEffect(() => {
    if (!focusResult || !hasPointValue) return;
    document.getElementById(reviewResultId(trade.id))?.focus();
    onResultFocused?.();
  }, [focusResult, hasPointValue, trade.id, onResultFocused]);
  return <section className="kairos-review__card" aria-label="Recorded result">
    <h2>Recorded result</h2>
    <p className={`kairos-review__result kairos-review__result--${visualPnl.outcome}`} id={reviewResultId(trade.id)} tabIndex={-1}><span>{visualPnl.label}</span><strong>{amount(visualPnl.amount, visualPnl.currency)}</strong></p>
    {metrics?.needsContractSize ? <p className="kairos-review__note">{NEEDS_CONTRACT_SIZE_WORDS}</p> : null}
    {addContractSize && canAddTradeContractSize(trade) ? <AddContractSizeControl entry={entry} idPrefix={`kairos-review-${trade.id}`} save={addContractSize.save} onSaved={addContractSize.onSaved} /> : null}
    {closedPart.available ? <p className="kairos-review__closed-part"><ResultText outcome={closedPart.outcome} label="Closed part" amount={closedPart.resultBeforeFees} currency={closedPart.currency} /> <span>{describeClosedPart(closedPart)}</span></p>
      : closedPart.reason === 'needs-contract-size' ? <p className="kairos-review__closed-part">{CLOSED_PART_NEEDS_CONTRACT_SIZE_WORDS}</p> : null}
    <dl className="kairos-review__facts">
      <div><dt>Result before fees</dt><dd>{amount(metrics?.grossPnl, trade.grossPnlCurrency)}</dd></div>
      <div><dt>Result after fees</dt><dd>{amount(metrics?.netPnl, metrics?.netPnlCurrency)}</dd></div>
      <div><dt>Fees</dt><dd>{fees.length === 0 ? 'None recorded' : amount(metrics?.totalFees, metrics?.totalFeesCurrency)}</dd></div>
      <div><dt>Money at risk</dt><dd>{describeMoneyAtRisk(projectTradeMoneyAtRisk(entry))}</dd></div>
      <div><dt>× what you risked</dt><dd>{(timesRisked.available ? describeTimesRisked(timesRisked.value) : null) ?? 'Not available'}</dd></div>
    </dl>
    {executions.length === 0 ? <p className="kairos-review__note">No entries or exits are recorded. Planned prices alone do not make a result.</p> : null}
    {entry.metricsError ? <p className="kairos-review__note">Some results are not available for this trade.</p> : null}
    {fees.length > 0 && metrics?.grossPnl != null && metrics.netPnl == null ? <p className="kairos-review__note">Result after fees needs a recorded price currency and fees in that same currency, or in pounds (GBP) for prices in pence (GBX). Kairos does not convert a trade's fees with exchange rates.</p> : null}
  </section>;
}

/** The plan the trade uses: its newest version (`latestTradePlan`), the same one every number reads. */
export function TradePlan({ plans }: { readonly plans: readonly TradePlanRecord[] }) {
  const plan = latestTradePlan(plans);
  return <section className="kairos-review__card" aria-label="Saved plan">
    <h2>Saved plan</h2><p className="kairos-review__note">Your planned levels are separate from actual entries and exits.</p>
    {plan === null ? <p>No plan recorded.</p> : <div className="kairos-review__record">
      {plan.reason ? <p className="kairos-review__reason"><strong>Why I'm taking it</strong> {plan.reason}</p> : null}
      <dl className="kairos-review__facts"><div><dt>Planned entry</dt><dd>{plan.plannedEntryPrice ?? 'Not recorded'}</dd></div><div><dt>Planned stop</dt><dd>{plan.plannedStopPrice ?? 'Not recorded'}</dd></div><div><dt>Planned target</dt><dd>{plan.plannedTargetPrice ?? 'Not recorded'}</dd></div><div><dt>Planned quantity</dt><dd>{plan.plannedQuantity ?? 'Not recorded'}</dd></div></dl>
    </div>}
  </section>;
}

export function TradeEntriesAndExits({ executions }: { readonly executions: readonly TradeExecutionRecord[] }) {
  return <section className="kairos-review__card" aria-label="Your entries and exits">
    <div className="kairos-review__topline"><h2>Your entries and exits</h2><span>{executions.length} recorded</span></div>
    {executions.length === 0 ? <p>No entries or exits recorded.</p> : <ol className="kairos-review__records">{executions.map((execution, index) => <li key={execution.id} className="kairos-review__record" data-execution-id={execution.id}>
      <h3>{index + 1}. {title(execution.type)}</h3>
      <dl className="kairos-review__facts"><div><dt>Price</dt><dd>{execution.price}</dd></div><div><dt>Quantity</dt><dd>{execution.quantity}</dd></div><div className="kairos-review__wide"><dt>Time</dt><dd><time dateTime={execution.executedAt}>{reviewTimestamp(execution.executedAt)}</time></dd></div></dl>
    </li>)}</ol>}
    <p className="kairos-review__note">Times are shown in your device's time zone.</p>
  </section>;
}

/** Each fee in money, with the entry or exit it belongs to. */
export function TradeFees({ executions, fees }: { readonly executions: readonly TradeExecutionRecord[]; readonly fees: readonly TradeFeeRecord[] }) {
  return <section className="kairos-review__card" aria-label="Recorded fees">
    <div className="kairos-review__topline"><h2>Fees</h2><span>{fees.length} recorded</span></div>
    {fees.length === 0 ? <p>No fees recorded.</p> : <ol className="kairos-review__records">{fees.map((fee, index) => {
      const executionIndex = fee.executionId === null ? -1 : executions.findIndex(execution => execution.id === fee.executionId);
      const association = fee.executionId === null ? 'Trade fee' : executionIndex < 0 ? 'Its entry or exit is not available' : `For ${executions[executionIndex].type} ${executionIndex + 1}`;
      return <li key={fee.id} className="kairos-review__record"><div className="kairos-review__topline"><h3>Fee {index + 1}</h3><strong>{fee.amount} {fee.currency}</strong></div><p className="kairos-review__note">{association}</p></li>;
    })}</ol>}
  </section>;
}

interface TradeDetailsProps {
  readonly entry: JournalHistoryEntry;
  readonly addContractSize?: AddContractSizePort;
  /** After a point value was added and the trade read again: the recorded result takes focus once. */
  readonly focusResult?: boolean;
  readonly onResultFocused?: () => void;
}

/**
 * Presentation of one saved trade, as Analysis shows it under the chart. P12/P11/P13 retain hydration, calculation and
 * result semantics; the one write is adding a missing point value. The trade's own page (U15) lays out the same parts.
 */
export function TradeDetails({ entry, addContractSize, focusResult, onResultFocused }: TradeDetailsProps) {
  return <div className="kairos-review__detail" data-review-trade-id={entry.trade.id}>
    <TradeOverview trade={entry.trade} />
    <TradeResult entry={entry} addContractSize={addContractSize} focusResult={focusResult} onResultFocused={onResultFocused} />
    <TradePlan plans={entry.plans} />
    <TradeEntriesAndExits executions={entry.executions} />
    <TradeFees executions={entry.executions} fees={entry.fees} />
  </div>;
}
