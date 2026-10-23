import { useId } from 'react';
import { describeMarketTile } from '../../application/performance/periodWords';
import type { MarketTile, MarketTiles } from '../../application/performance/marketTiles';
import { describeVisualPnlCompactAmount, projectVisualPnlStrengthScale, visualPnlStrengthOf } from '../../application/visual-pnl';
import { ResultText } from '../../design-system/primitives';
import './results.css';

export interface ResultsMarketTilesProps {
  readonly markets: MarketTiles;
  /** The open tile's key, for aria-pressed. */
  readonly selectedKey: string | null;
  readonly onSelectTile: (tile: MarketTile) => void;
}

const OUTCOME_LABEL = Object.freeze({ profit: 'Profit', loss: 'Loss', breakeven: 'Break-even' } as const);

/** U5 (D206): "Your markets", one tile per market sized by money made or lost, or by trades. Presentational only. */
export function ResultsMarketTiles({ markets, selectedKey, onSelectTile }: ResultsMarketTilesProps) {
  const titleId = useId();
  const { tiles, sizeBasis, currency } = markets;
  // The calendar's colour rule, on each tile's total.
  const scale = projectVisualPnlStrengthScale(tiles.map(tile => tile.total));
  return <section className="kairos-results-markets" aria-labelledby={titleId}>
    <h3 id={titleId} tabIndex={-1}>Your markets</h3>
    <div className="kairos-results-markets__grid">
      {tiles.map(tile => {
        const { total, outcomes } = tile;
        const short = total.available ? describeVisualPnlCompactAmount(total.total) : null;
        return <button key={tile.key} type="button" className="kairos-results-markets__tile" data-tile-key={tile.key} data-size={tile.size}
          data-tile-result={total.available ? total.outcome : 'unavailable'} data-tile-strength={visualPnlStrengthOf(total, scale) ?? undefined}
          aria-pressed={selectedKey === tile.key} aria-label={describeMarketTile(tile)} onClick={() => onSelectTile(tile)}>
          <strong className="kairos-results-markets__symbol">{tile.symbol ?? `Other markets (${tile.marketCount})`}</strong>
          {total.available && short !== null
            ? <ResultText outcome={total.outcome} label={OUTCOME_LABEL[total.outcome]} amount={short} currency={sizeBasis === 'money' ? null : total.currency} showLabel={false} />
            : <ResultText outcome="unavailable" label="Not available" amount={null} />}
          <span className="kairos-results-markets__count">{outcomes.tradeCount} {outcomes.tradeCount === 1 ? 'trade' : 'trades'} · won {outcomes.won}</span>
        </button>;
      })}
    </div>
    <p className="kairos-results-calendar__legend">{sizeBasis === 'money' ? `Bigger tile: more money made or lost. Amounts in ${currency}.` : 'Bigger tile: more trades.'}</p>
  </section>;
}
