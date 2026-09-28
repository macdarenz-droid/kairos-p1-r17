import type { IPrimitivePaneRenderer } from 'lightweight-charts';
import { paintLightweightChartsV5RiskRewardBox } from '../features/chart/lightweightChartsV5RiskRewardBoxPaint';
import type {
  AnalysisSavedTradeRiskRewardCoordinateProjection,
  AnalysisSavedTradeRiskRewardScreenObject,
} from './analysisSavedTradeRiskRewardCoordinateProjection';

export interface AnalysisSavedTradeRiskRewardCanvasStyleSource {
  readonly lineWidth: number;
  readonly zoneOpacity: number;
  resolveToken(token: string): string | null;
}

export type AnalysisSavedTradeRiskRewardCanvasPaneProjection =
  | Extract<AnalysisSavedTradeRiskRewardCoordinateProjection, { readonly kind: 'unavailable' }>
  | {
      readonly kind: 'unavailable';
      readonly reason: 'canvas-evidence-invalid';
    }
  | {
      readonly kind: 'pane-ready';
      readonly coordinateProjection: Extract<
        AnalysisSavedTradeRiskRewardCoordinateProjection,
        { readonly kind: 'coordinate-ready' }
      >;
      readonly paneRenderer: IPrimitivePaneRenderer;
    };

interface ResolvedCanvasStyle {
  readonly lineWidth: number;
  readonly zoneOpacity: number;
  readonly entry: string;
  readonly stop: string;
  readonly target: string;
  readonly risk: string;
  readonly reward: string;
}

function allFinite(values: readonly number[]): boolean {
  return values.every(Number.isFinite);
}

function hasExactScreenEvidence(screen: AnalysisSavedTradeRiskRewardScreenObject): boolean {
  const { levels, zones } = screen;
  const sameExtent = (
    value: { readonly startX: number; readonly endX: number }
      | { readonly start: { readonly x: number }; readonly end: { readonly x: number } },
  ): boolean => {
    const startX = 'startX' in value ? value.startX : value.start.x;
    const endX = 'endX' in value ? value.endX : value.end.x;
    return startX === levels.entry.start.x && endX === levels.entry.end.x;
  };

  return levels.entry.role === 'entry'
    && levels.stop.role === 'stop'
    && levels.target.role === 'target'
    && zones.risk.role === 'risk'
    && zones.reward.role === 'reward'
    && sameExtent(levels.entry)
    && sameExtent(levels.stop)
    && sameExtent(levels.target)
    && sameExtent(zones.risk)
    && sameExtent(zones.reward)
    && zones.risk.fromY === levels.entry.start.y
    && zones.risk.toY === levels.stop.start.y
    && zones.reward.fromY === levels.entry.start.y
    && zones.reward.toY === levels.target.start.y
    && allFinite([
      levels.entry.start.x,
      levels.entry.start.y,
      levels.entry.end.x,
      levels.entry.end.y,
      levels.stop.start.x,
      levels.stop.start.y,
      levels.stop.end.x,
      levels.stop.end.y,
      levels.target.start.x,
      levels.target.start.y,
      levels.target.end.x,
      levels.target.end.y,
      zones.risk.startX,
      zones.risk.endX,
      zones.risk.fromY,
      zones.risk.toY,
      zones.reward.startX,
      zones.reward.endX,
      zones.reward.fromY,
      zones.reward.toY,
    ]);
}

function resolveCanvasStyle(
  screen: AnalysisSavedTradeRiskRewardScreenObject,
  source: AnalysisSavedTradeRiskRewardCanvasStyleSource,
): ResolvedCanvasStyle {
  if (!Number.isFinite(source.lineWidth) || source.lineWidth <= 0
    || !Number.isFinite(source.zoneOpacity) || source.zoneOpacity < 0 || source.zoneOpacity > 1) {
    throw new Error('Risk/Reward Canvas style evidence is invalid');
  }

  const resolve = (token: string): string => {
    const value = source.resolveToken(token);
    if (value === null || value.trim().length === 0) {
      throw new Error('Risk/Reward Canvas token evidence is unavailable');
    }
    return value;
  };

  return Object.freeze({
    lineWidth: source.lineWidth,
    zoneOpacity: source.zoneOpacity,
    entry: resolve(screen.levels.entry.token),
    stop: resolve(screen.levels.stop.token),
    target: resolve(screen.levels.target.token),
    risk: resolve(screen.zones.risk.token),
    reward: resolve(screen.zones.reward.token),
  });
}

function createPaneRenderer(
  screen: AnalysisSavedTradeRiskRewardScreenObject,
  style: ResolvedCanvasStyle,
): IPrimitivePaneRenderer {
  // hasExactScreenEvidence guarantees the zones and levels share one extent and edges.
  const geometry = Object.freeze({
    startX: screen.levels.entry.start.x,
    endX: screen.levels.entry.end.x,
    entryY: screen.levels.entry.start.y,
    stopY: screen.levels.stop.start.y,
    targetY: screen.levels.target.start.y,
  });
  const colors = Object.freeze({ entry: style.entry, stop: style.stop, target: style.target, risk: style.risk, reward: style.reward });

  return Object.freeze({
    draw(target: Parameters<IPrimitivePaneRenderer['draw']>[0]): void {
      target.useBitmapCoordinateSpace((scope) => {
        paintLightweightChartsV5RiskRewardBox(scope.context, scope.horizontalPixelRatio, scope.verticalPixelRatio, geometry, colors, style.lineWidth, style.zoneOpacity);
      });
    },
  });
}

/**
 * Converts only Gate450's exact screen evidence into a Canvas pane renderer.
 * Token values are caller-resolved presentation input; this owner does not
 * attach a provider primitive, own scales/lifecycle, infer facts or mutate UI.
 */
export function projectAnalysisSavedTradeRiskRewardCanvasPaneRenderer(
  projection: AnalysisSavedTradeRiskRewardCoordinateProjection,
  styleSource: AnalysisSavedTradeRiskRewardCanvasStyleSource,
): AnalysisSavedTradeRiskRewardCanvasPaneProjection {
  if (projection.kind !== 'coordinate-ready') {
    return projection;
  }
  if (!hasExactScreenEvidence(projection.screenObject)) {
    return Object.freeze({ kind: 'unavailable' as const, reason: 'canvas-evidence-invalid' as const });
  }

  try {
    const style = resolveCanvasStyle(projection.screenObject, styleSource);
    return Object.freeze({
      kind: 'pane-ready' as const,
      coordinateProjection: projection,
      paneRenderer: createPaneRenderer(projection.screenObject, style),
    });
  } catch {
    return Object.freeze({ kind: 'unavailable' as const, reason: 'canvas-evidence-invalid' as const });
  }
}
