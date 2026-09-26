import type {
  LightweightChartsV5PriceCoordinateApi,
  LightweightChartsV5TimeCoordinateApi,
} from '../features/chart/lightweightChartsV5TrendLineCoordinateProjection';
import type {
  AnalysisSavedTradeRiskRewardRendererLevel,
  AnalysisSavedTradeRiskRewardRendererObject,
  AnalysisSavedTradeRiskRewardRendererProjection,
  AnalysisSavedTradeRiskRewardRendererZone,
} from './analysisSavedTradeRiskRewardRendererProjection';

export interface AnalysisSavedTradeRiskRewardScreenLevel<Role extends 'entry' | 'stop' | 'target'> {
  readonly role: Role;
  readonly token: string;
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
}

export interface AnalysisSavedTradeRiskRewardScreenZone<Role extends 'risk' | 'reward'> {
  readonly role: Role;
  readonly token: string;
  readonly startX: number;
  readonly endX: number;
  readonly fromY: number;
  readonly toY: number;
}

export interface AnalysisSavedTradeRiskRewardScreenObject {
  readonly id: string;
  readonly side: AnalysisSavedTradeRiskRewardRendererObject['side'];
  readonly levels: {
    readonly entry: AnalysisSavedTradeRiskRewardScreenLevel<'entry'>;
    readonly stop: AnalysisSavedTradeRiskRewardScreenLevel<'stop'>;
    readonly target: AnalysisSavedTradeRiskRewardScreenLevel<'target'>;
  };
  readonly zones: {
    readonly risk: AnalysisSavedTradeRiskRewardScreenZone<'risk'>;
    readonly reward: AnalysisSavedTradeRiskRewardScreenZone<'reward'>;
  };
}

export type AnalysisSavedTradeRiskRewardCoordinateProjection =
  | Extract<AnalysisSavedTradeRiskRewardRendererProjection, { readonly kind: 'unavailable' }>
  | {
      readonly kind: 'unavailable';
      readonly reason: 'coordinate-evidence-invalid';
    }
  | {
      readonly kind: 'coordinate-ready';
      readonly logicalObject: Extract<AnalysisSavedTradeRiskRewardRendererProjection, { readonly kind: 'renderer-ready' }>['logicalObject'];
      readonly rendererObject: AnalysisSavedTradeRiskRewardRendererObject;
      readonly screenObject: AnalysisSavedTradeRiskRewardScreenObject;
    };

function hasExactRendererEvidence(
  projection: Extract<AnalysisSavedTradeRiskRewardRendererProjection, { readonly kind: 'renderer-ready' }>,
): boolean {
  const { logicalObject, rendererObject } = projection;
  const { levels, zones } = rendererObject;
  const sameExtent = (
    value: AnalysisSavedTradeRiskRewardRendererLevel<'entry' | 'stop' | 'target'>
      | AnalysisSavedTradeRiskRewardRendererZone<'risk' | 'reward'>,
  ): boolean => value.start === levels.entry.start && value.end === levels.entry.end;

  return rendererObject.id === logicalObject.id
    && rendererObject.side === logicalObject.side
    && levels.entry.role === 'entry'
    && levels.stop.role === 'stop'
    && levels.target.role === 'target'
    && zones.risk.role === 'risk'
    && zones.reward.role === 'reward'
    && levels.entry.token === logicalObject.levels.entry.token
    && levels.stop.token === logicalObject.levels.stop.token
    && levels.target.token === logicalObject.levels.target.token
    && zones.risk.token === logicalObject.zones.risk.token
    && zones.reward.token === logicalObject.zones.reward.token
    && sameExtent(levels.entry)
    && sameExtent(levels.stop)
    && sameExtent(levels.target)
    && sameExtent(zones.risk)
    && sameExtent(zones.reward)
    && zones.risk.from === levels.entry.price
    && zones.risk.to === levels.stop.price
    && zones.reward.from === levels.entry.price
    && zones.reward.to === levels.target.price;
}

function requireCoordinate(value: number | null): number {
  if (value === null || !Number.isFinite(value)) {
    throw new Error('Risk/Reward coordinate evidence is unavailable');
  }
  return value;
}

function projectLevel<Role extends 'entry' | 'stop' | 'target'>(
  level: AnalysisSavedTradeRiskRewardRendererLevel<Role>,
  startX: number,
  endX: number,
  series: LightweightChartsV5PriceCoordinateApi,
): AnalysisSavedTradeRiskRewardScreenLevel<Role> {
  const y = requireCoordinate(series.priceToCoordinate(level.price));
  return Object.freeze({
    role: level.role,
    token: level.token,
    start: Object.freeze({ x: startX, y }),
    end: Object.freeze({ x: endX, y }),
  });
}

function projectZone<Role extends 'risk' | 'reward'>(
  zone: AnalysisSavedTradeRiskRewardRendererZone<Role>,
  startX: number,
  endX: number,
  series: LightweightChartsV5PriceCoordinateApi,
): AnalysisSavedTradeRiskRewardScreenZone<Role> {
  return Object.freeze({
    role: zone.role,
    token: zone.token,
    startX,
    endX,
    fromY: requireCoordinate(series.priceToCoordinate(zone.from)),
    toY: requireCoordinate(series.priceToCoordinate(zone.to)),
  });
}

/**
 * Projects Gate449's exact renderer-safe Risk/Reward object through only the
 * caller-owned Lightweight Charts scales. It owns screen-coordinate evidence,
 * not Canvas drawing, provider lifecycle, interaction, persistence or truth.
 */
export function projectAnalysisSavedTradeRiskRewardCoordinates(
  projection: AnalysisSavedTradeRiskRewardRendererProjection,
  timeScale: LightweightChartsV5TimeCoordinateApi,
  series: LightweightChartsV5PriceCoordinateApi,
): AnalysisSavedTradeRiskRewardCoordinateProjection {
  if (projection.kind !== 'renderer-ready') {
    return projection;
  }
  if (!hasExactRendererEvidence(projection)) {
    return Object.freeze({ kind: 'unavailable' as const, reason: 'coordinate-evidence-invalid' as const });
  }

  try {
    const { logicalObject, rendererObject } = projection;
    const startX = requireCoordinate(timeScale.timeToCoordinate(rendererObject.levels.entry.start));
    const endX = requireCoordinate(timeScale.timeToCoordinate(rendererObject.levels.entry.end));
    const screenObject: AnalysisSavedTradeRiskRewardScreenObject = Object.freeze({
      id: rendererObject.id,
      side: rendererObject.side,
      levels: Object.freeze({
        entry: projectLevel(rendererObject.levels.entry, startX, endX, series),
        stop: projectLevel(rendererObject.levels.stop, startX, endX, series),
        target: projectLevel(rendererObject.levels.target, startX, endX, series),
      }),
      zones: Object.freeze({
        risk: projectZone(rendererObject.zones.risk, startX, endX, series),
        reward: projectZone(rendererObject.zones.reward, startX, endX, series),
      }),
    });

    return Object.freeze({
      kind: 'coordinate-ready' as const,
      logicalObject,
      rendererObject,
      screenObject,
    });
  } catch {
    return Object.freeze({ kind: 'unavailable' as const, reason: 'coordinate-evidence-invalid' as const });
  }
}
