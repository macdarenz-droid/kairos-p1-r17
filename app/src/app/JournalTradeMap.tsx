import type { JournalHistoryEntry } from '../application/journal';
import { projectJournalTradeVisualizer } from '../application/trade-visualizer';
import { JournalTradeMapGraphic } from './JournalTradeMapGraphic';
import { reviewTimestamp } from './TradeReviewDetails';

interface JournalTradeMapProps {
  readonly entry: JournalHistoryEntry;
}

function sideLabel(side: 'long' | 'short'): string {
  return side === 'long' ? 'Long' : 'Short';
}

function statusLabel(status: 'draft' | 'open' | 'closed' | 'cancelled'): string {
  if (status === 'draft') return 'Draft';
  if (status === 'open') return 'Open';
  if (status === 'closed') return 'Closed';
  return 'Cancelled';
}

/**
 * P14.4 first presentation boundary for the Trade Visualizer.
 * This deliberately renders exact textual trade-map facts before any geometry.
 * It consumes the P14.3 projection and performs no price arithmetic, scaling,
 * market-data lookup, path inference, or financial calculation.
 */
export function JournalTradeMap({ entry }: JournalTradeMapProps) {
  const model = projectJournalTradeVisualizer(entry);

  if (model.levels.length === 0) return null;

  return (
    <section className="kairos-trade-map" aria-label={`${model.symbol} trade map`}>
      <div className="kairos-trade-map__heading">
        <strong>Trade map</strong>
        <span>{sideLabel(model.side)} · {statusLabel(model.status)}</span>
      </div>
      <p className="kairos-trade-map__scale-note">Visual guide · Not to scale</p>
      <JournalTradeMapGraphic model={model} />
      <dl className="kairos-trade-map__levels">
        {model.levels.map((level, index) => (
          <div key={`${level.kind}-${index}`} data-level-kind={level.kind}>
            <dt>{level.label}</dt>
            <dd>
              <span>{level.price}</span>
              {level.kind === 'executed-entry' && level.executedAt !== null ? (
                <small className="kairos-trade-map__execution-time">
                  Quantity {level.quantity} · Executed <time dateTime={level.executedAt}>{reviewTimestamp(level.executedAt)}</time>
                </small>
              ) : null}
              {level.kind === 'executed-exit' && level.executedAt !== null ? (
                <small className="kairos-trade-map__execution-time">
                  Quantity {level.quantity} · Executed <time dateTime={level.executedAt}>{reviewTimestamp(level.executedAt)}</time>
                </small>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
