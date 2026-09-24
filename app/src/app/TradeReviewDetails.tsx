import type { JournalHistoryEntry } from '../application/journal';

export function reviewTimestamp(value: string | null): string {
  if (value === null) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function amount(value: string | null | undefined, currency?: string | null): string {
  return value == null ? 'Not available' : currency ? `${value} ${currency}` : `${value} · Currency not recorded`;
}

function title(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }

/** Read-only presentation. P12/P11/P13 retain hydration, calculation and result semantics. */
export function TradeReviewDetails({ entry }: { readonly entry: JournalHistoryEntry }) {
  const { trade, plans, executions, fees, metrics, visualPnl } = entry;
  return <div className="kairos-review__detail" data-review-trade-id={trade.id}>
    <section className="kairos-review__card" aria-label="Trade overview">
      <div className="kairos-review__topline"><h2>{trade.symbol}</h2><span>{title(trade.side)} · {title(trade.status)}</span></div>
      <dl className="kairos-review__facts">
        <div><dt>Market</dt><dd>{title(trade.marketType)}</dd></div><div><dt>Source</dt><dd>{title(trade.source)}</dd></div>
        <div><dt>Price currency</dt><dd>{trade.grossPnlCurrency || 'Not recorded'}</dd></div>
        <div><dt>Opened</dt><dd>{trade.openedAt ? <time dateTime={trade.openedAt}>{reviewTimestamp(trade.openedAt)}</time> : 'Not recorded'}</dd></div>
        <div><dt>Closed</dt><dd>{trade.closedAt ? <time dateTime={trade.closedAt}>{reviewTimestamp(trade.closedAt)}</time> : 'Not recorded'}</dd></div>
        <div><dt>Last updated</dt><dd><time dateTime={trade.updatedAt}>{reviewTimestamp(trade.updatedAt)}</time></dd></div>
      </dl>
    </section>
    <section className="kairos-review__card" aria-label="Recorded result">
      <h2>Recorded result</h2>
      <p className={`kairos-review__result kairos-review__result--${visualPnl.outcome}`}><span>{visualPnl.label}</span><strong>{amount(visualPnl.amount, visualPnl.currency)}</strong></p>
      <dl className="kairos-review__facts"><div><dt>Gross P&amp;L</dt><dd>{amount(metrics?.grossPnl, trade.grossPnlCurrency)}</dd></div><div><dt>Net P&amp;L</dt><dd>{amount(metrics?.netPnl, metrics?.netPnlCurrency)}</dd></div></dl>
      {executions.length === 0 ? <p className="kairos-review__note">No actual executions are recorded. Planned prices alone do not establish a result.</p> : null}
      {entry.metricsError ? <p className="kairos-review__note">Some performance values are unavailable for this trade.</p> : null}
      {fees.length > 0 && metrics?.grossPnl != null && metrics.netPnl == null ? <p className="kairos-review__note">Net P&amp;L needs a recorded price currency and compatible fee currencies. Currency conversion is not applied.</p> : null}
    </section>
    <section className="kairos-review__card" aria-label="Saved plan">
      <h2>Saved plan</h2><p className="kairos-review__note">Your planned levels are separate from actual entries and exits.</p>
      {plans.length === 0 ? <p>No plan recorded.</p> : plans.map((plan, index) => <div key={plan.id} className="kairos-review__record">
        {plans.length > 1 ? <h3>Plan {index + 1}</h3> : null}
        <dl className="kairos-review__facts"><div><dt>Planned entry</dt><dd>{plan.plannedEntryPrice ?? 'Not recorded'}</dd></div><div><dt>Planned stop</dt><dd>{plan.plannedStopPrice ?? 'Not recorded'}</dd></div><div><dt>Planned target</dt><dd>{plan.plannedTargetPrice ?? 'Not recorded'}</dd></div><div><dt>Planned quantity</dt><dd>{plan.plannedQuantity ?? 'Not recorded'}</dd></div></dl>
      </div>)}
    </section>
    <section className="kairos-review__card" aria-label="Actual executions">
      <div className="kairos-review__topline"><h2>Actual executions</h2><span>{executions.length} recorded</span></div>
      {executions.length === 0 ? <p>No executions recorded.</p> : <ol className="kairos-review__records">{executions.map((execution, index) => <li key={execution.id} className="kairos-review__record" data-execution-id={execution.id}>
        <h3>{index + 1}. {title(execution.type)}</h3>
        <dl className="kairos-review__facts"><div><dt>Price</dt><dd>{execution.price}</dd></div><div><dt>Quantity</dt><dd>{execution.quantity}</dd></div><div className="kairos-review__wide"><dt>Executed</dt><dd><time dateTime={execution.executedAt}>{reviewTimestamp(execution.executedAt)}</time></dd></div></dl>
      </li>)}</ol>}
      <p className="kairos-review__note">Times are shown in your device's time zone.</p>
    </section>
    <section className="kairos-review__card" aria-label="Recorded fees">
      <div className="kairos-review__topline"><h2>Fees</h2><span>{fees.length} recorded</span></div>
      {fees.length === 0 ? <p>No fees recorded.</p> : <ol className="kairos-review__records">{fees.map((fee, index) => {
        const executionIndex = fee.executionId === null ? -1 : executions.findIndex(execution => execution.id === fee.executionId);
        const association = fee.executionId === null ? 'Trade fee' : executionIndex < 0 ? 'Linked execution unavailable' : `Execution ${executionIndex + 1} · ${title(executions[executionIndex].type)}`;
        return <li key={fee.id} className="kairos-review__record"><div className="kairos-review__topline"><h3>Fee {index + 1}</h3><strong>{fee.amount} {fee.currency}</strong></div><p className="kairos-review__note">{association}</p></li>;
      })}</ol>}
    </section>
  </div>;
}
