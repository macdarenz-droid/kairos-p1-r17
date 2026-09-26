import { useId } from 'react';
import type { TradeVisualizerDisplayModel, TradeVisualizerLevelKind } from '../application/trade-visualizer';

interface JournalTradeMapGraphicProps {
  readonly model: TradeVisualizerDisplayModel;
}

function LevelMarker({ kind, y }: { readonly kind: TradeVisualizerLevelKind; readonly y: number }) {
  if (kind === 'planned-entry') {
    return <circle data-marker-shape="circle" className="kairos-trade-map__marker kairos-trade-map__marker--entry" cx="20" cy={y} r="4" />;
  }
  if (kind === 'planned-stop') {
    return <rect data-marker-shape="square" className="kairos-trade-map__marker kairos-trade-map__marker--stop" x="16" y={y - 4} width="8" height="8" />;
  }
  if (kind === 'planned-target') {
    return <polygon data-marker-shape="triangle" className="kairos-trade-map__marker kairos-trade-map__marker--target" points={`20,${y - 5} 25,${y + 4} 15,${y + 4}`} />;
  }
  if (kind === 'executed-entry') {
    return <path data-marker-shape="cross" className="kairos-trade-map__marker kairos-trade-map__marker--actual-entry" d={`M16 ${y - 4} L24 ${y + 4} M24 ${y - 4} L16 ${y + 4}`} />;
  }
  return <polygon data-marker-shape="diamond" className="kairos-trade-map__marker kairos-trade-map__marker--exit" points={`20,${y - 5} 25,${y} 20,${y + 5} 15,${y}`} />;
}

/**
 * P14.6 supplementary categorical trade-map visual.
 *
 * Level order and spacing remain categorical and NOT price-scaled. Marker shape
 * and lane pattern communicate level kind without relying on color alone. Exact
 * values remain owned by the adjacent native HTML definition list.
 */
export function JournalTradeMapGraphic({ model }: JournalTradeMapGraphicProps) {
  const accessibilityId = useId();
  const titleId = `trade-map-title-${accessibilityId}`;
  const descId = `trade-map-desc-${accessibilityId}`;
  const laneCount = Math.max(model.levels.length, 1);
  const laneHeight = 24;
  const height = laneCount * laneHeight + 24;

  return (
    <svg
      className="kairos-trade-map__graphic"
      viewBox={`0 0 320 ${height}`}
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <title id={titleId}>{model.symbol} trade map visual</title>
      <desc id={descId}>Categorical trade levels shown at equal spacing with distinct marker shapes. Not to scale. Exact prices are listed below.</desc>
      {model.levels.map((level, index) => {
        const y = 20 + index * laneHeight;
        return (
          <g key={`${level.kind}-${index}`} data-level-kind={level.kind}>
            <line className={`kairos-trade-map__lane kairos-trade-map__lane--${level.kind}`} x1="12" x2="308" y1={y} y2={y} />
            <LevelMarker kind={level.kind} y={y} />
            <text className="kairos-trade-map__graphic-label" x="32" y={y + 4}>{level.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
