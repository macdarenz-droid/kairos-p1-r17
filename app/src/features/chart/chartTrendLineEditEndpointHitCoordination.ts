import type { ChartDrawingInteractionState } from './chartDrawingInteractionContract';
import type { ChartDrawingInteractionSession } from './chartDrawingInteractionPort';
import { initiateChartTrendLineEditFromSelection } from './chartTrendLineEditInitiationCoordination';
import type { LightweightChartsV5TrendLineEditEndpointHit } from './lightweightChartsV5TrendLineHitTest';

/**
 * P18.56 provider-neutral endpoint-hit -> authoritative edit-initiation coordination.
 *
 * P18.55 remains the sole projected endpoint hit-test geometry owner and P18.54
 * remains the sole selected-state + typed endpoint -> start-editing coordinator.
 * This seam binds those owners without allowing provider/UI callers to substitute
 * a drawing identity: the endpoint hit must name the same drawing currently held
 * by authoritative `selected` interaction state before its endpoint is delegated
 * to P18.54.
 *
 * A null hit, non-selected state, or mismatched/stale hit identity is a strict
 * no-op. P18.54 re-reads authoritative state before dispatch, so if interaction
 * truth changes between this identity check and delegation, the operation still
 * fails closed rather than dispatching against stale evidence.
 *
 * This coordinator performs no hit-test geometry, provider subscription,
 * coordinate conversion, direct interaction dispatch, edit execution, committed
 * drawing mutation, presentation refresh, persistence/restore, undo/redo,
 * toolbar/UI ownership, or P19 Risk/Reward behavior.
 */
export function coordinateChartTrendLineEditEndpointHit(
  interaction: Pick<ChartDrawingInteractionSession, 'getState' | 'dispatch'>,
  hit: LightweightChartsV5TrendLineEditEndpointHit | null,
): ChartDrawingInteractionState | null {
  if (hit === null) return null;

  const selected = interaction.getState();
  if (selected.status !== 'selected' || selected.drawingId !== hit.id) return null;

  return initiateChartTrendLineEditFromSelection(interaction, hit.endpoint);
}
