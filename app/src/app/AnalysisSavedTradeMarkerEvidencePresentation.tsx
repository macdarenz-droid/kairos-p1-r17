import type { AnalysisSavedTradeMarkerPresentationResult } from './analysisSavedTradeMarkerPresentationSession';
import type { AnalysisSavedTradeUnplacedExecution } from './analysisSavedTradeExecutionMarkerProjection';

export interface AnalysisSavedTradeMarkerEvidencePresentationProps {
  readonly presentation: AnalysisSavedTradeMarkerPresentationResult | null;
  readonly lastError: unknown | null;
  readonly quoteAsset: string;
}

const unplacedLabel = (reason: AnalysisSavedTradeUnplacedExecution['reason']): string => {
  switch (reason) {
    case 'execution-time-invalid': return 'Not shown · saved execution time is invalid';
    case 'before-history': return 'Not shown · before available candle history';
    case 'after-history': return 'Not shown · after available candle history';
    case 'not-covered': return 'Not shown · candle history has a gap at this time';
  }
};

const unavailableDetail = (result: AnalysisSavedTradeMarkerPresentationResult): string => {
  if (result.reference.kind === 'unavailable') {
    switch (result.reference.reason) {
      case 'market-type-mismatch': return 'This saved trade is not recorded as crypto.';
      case 'symbol-mismatch': return 'Choose the saved trade’s exact symbol to show its executions.';
      case 'price-currency-missing': return 'The saved trade has no recorded price currency.';
      case 'price-currency-mismatch': return 'The saved trade’s price currency does not match this chart’s quote asset.';
    }
  }
  if (result.markers.kind === 'unavailable') {
    switch (result.markers.reason) {
      case 'reference-unavailable': return 'The saved trade does not have exact evidence for this chart.';
      case 'history-scope-mismatch': return 'The authoritative candle history does not match this chart.';
      case 'history-empty': return 'No authoritative candles are available for placement.';
      case 'history-window-invalid': return 'The authoritative candle windows cannot safely place executions.';
    }
  }
  return 'Saved execution markers are unavailable for this chart.';
};

/** Accessible view of the exact released marker result; no facts are derived. */
export function AnalysisSavedTradeMarkerEvidencePresentation({
  presentation,
  lastError,
  quoteAsset,
}: AnalysisSavedTradeMarkerEvidencePresentationProps) {
  const refreshAlert = lastError !== null
    ? <p role="alert">Saved trade marker details could not be refreshed. The last complete details remain unchanged.</p>
    : null;

  if (presentation === null) {
    return <section aria-label="Saved trade marker details">
      {refreshAlert ?? <p role="status">Preparing saved trade marker details from authoritative candle history.</p>}
    </section>;
  }

  if (presentation.markers.kind === 'unavailable') {
    return <section aria-label="Saved trade marker details">
      {refreshAlert}
      <div role="status" data-saved-trade-marker-evidence="unavailable">
        <strong>Saved trade markers unavailable</strong>
        <p className="kairos-analysis-chart__note">{unavailableDetail(presentation)}</p>
      </div>
    </section>;
  }

  const { markers, unplacedExecutions, historyInterval, historyObservedAt } = presentation.markers;
  const rows = [
    ...markers.map(marker => ({
      key: marker.markerId,
      role: marker.role,
      placement: 'Shown on chart',
      executedAt: marker.executedAt,
      price: marker.price,
      quantity: marker.quantity,
      candle: marker.candleAnchorTime,
    })),
    ...unplacedExecutions.map(execution => ({
      key: `unplaced:${execution.executionId}`,
      role: execution.role,
      placement: unplacedLabel(execution.reason),
      executedAt: execution.executedAt,
      price: execution.price,
      quantity: execution.quantity,
      candle: '—',
    })),
  ];

  return <section aria-label="Saved trade marker details" data-saved-trade-marker-evidence="ready">
    {refreshAlert}
    <p role="status"><strong>Saved trade markers · {markers.length} shown · {unplacedExecutions.length} not shown</strong></p>
    <p className="kairos-analysis-chart__note">Exact saved execution facts against the {historyInterval} authoritative page received {historyObservedAt}.</p>
    <details className="kairos-analysis-chart__data">
      <summary>Saved execution details</summary>
      <div className="kairos-analysis-chart__table-scroll" tabIndex={0} role="region" aria-label="Saved execution marker evidence table">
        <table>
          <caption>Saved execution evidence · prices in {quoteAsset} · times in UTC</caption>
          <thead><tr><th scope="col">Type</th><th scope="col">Chart status</th><th scope="col">Executed at</th><th scope="col">Price</th><th scope="col">Quantity</th><th scope="col">Candle anchor</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.key}>
            <th scope="row">{row.role === 'entry' ? 'Entry' : 'Exit'}</th>
            <td>{row.placement}</td><td>{row.executedAt}</td><td>{row.price}</td><td>{row.quantity}</td><td>{row.candle}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>
  </section>;
}
