import type { ChartEngineSeriesHandle } from './chartEngineDriver';
import type { ChartDrawingInteractionStateListener } from './chartDrawingInteractionPort';
import type { ChartDrawingCollectionSession } from './chartDrawingCollection';
import type { ChartDrawingPresentationDrawingRefreshSession } from './chartDrawingPresentationPort';
import type { RendererChartDrawing } from './chartDrawingProjection';
import {
  createChartTrendLineDraftInteractionPort,
  type ChartTrendLineDraftInteractionSession,
} from './chartTrendLineDraftInteractionCoordination';
import { createLightweightChartsV5DrawingClickSubscriptionFromBinding } from './lightweightChartsV5DrawingClickBindingComposition';
import type { LightweightChartsV5DrawingClickSubscription } from './lightweightChartsV5DrawingClickSubscription';
import { coordinateLightweightChartsV5DrawingSelectionInteraction } from './lightweightChartsV5DrawingSelectionInteractionCoordination';
import { coordinateLightweightChartsV5TrendLineEditEndpointClick } from './lightweightChartsV5TrendLineEditEndpointClickCoordination';
import { executeChartTrendLineEditAndRefreshPresentation } from './chartTrendLineEditPresentationCoordination';
import type { LightweightChartsV5TrendLineScreenSegment } from './lightweightChartsV5TrendLineCoordinateProjection';
import type { LightweightChartsV5DriverBinding } from './lightweightChartsV5ModuleAdapter';

export interface LightweightChartsV5TrendLineEditEndpointClickLifecycleOptions {
  readonly getCurrentSegments: () => readonly LightweightChartsV5TrendLineScreenSegment[];
  readonly tolerancePx: number;
}

export interface LightweightChartsV5TrendLineEditClickExecutionLifecycleOptions {
  readonly collection: ChartDrawingCollectionSession;
  readonly presentation: ChartDrawingPresentationDrawingRefreshSession;
}

/**
 * P18.30/P18.42/P18.58/P18.59 Lightweight Charts v5 drawing interaction lifecycle composition.
 *
 * This boundary remains the sole lifecycle composition seam between the already-
 * authoritative provider click binding (P18.27/P18.40) and the provider-neutral
 * trend-line interaction session (P18.29). P18.42 optionally composes the same
 * raw provider click into P18.41 selection coordination using a caller-supplied
 * current renderer drawing snapshot. P18.58 optionally composes the same raw provider
 * click into P18.57 selected trend-line endpoint edit initiation using a caller-supplied
 * current projected screen-segment snapshot and presentation tolerance. P18.59 optionally
 * routes a later projected click anchor through P18.51R3 edit execution + drawing-only
 * presentation refresh when the interaction was already in authoritative `editing` state
 * before that raw provider click. No second provider subscription is created.
 *
 * P18.58 evaluates endpoint-edit evidence before selection evidence for the same raw
 * click. This preserves the pre-click authoritative selected identity: an endpoint
 * click on the already-selected drawing may enter editing, while an endpoint click
 * on another drawing may only select that drawing on this click and cannot silently
 * become edit intent in the same event. P18.23 remains the sole transition-acceptance
 * owner. Raw provider evidence is still observed before projected anchor delivery because
 * P18.40 owns that ordering. P18.59 snapshots whether the session was already `editing`
 * before raw-click coordination; only that pre-click state may route the projected anchor
 * to P18.51R3. This prevents the endpoint-initiation click itself from immediately executing
 * a zero-movement edit. All non-edit anchors continue through the unchanged P18.29 path.
 *
 * Provider subscription setup failure destroys the just-created neutral session
 * before rethrowing. destroy() detaches provider click delivery before destroying
 * the neutral session and is idempotent through the composed owners.
 *
 * No provider subscribe/unsubscribe API is reimplemented here. No selection or endpoint
 * geometry is reimplemented here. No interaction state, coordinate conversion, drawing collection
 * mutation implementation, drawing ID allocation, committed drawing construction, persistence,
 * toolbar/UI state, drag lifecycle, deletion execution, undo/redo, new drawing kinds,
 * journal truth, or P19 Risk/Reward behavior lives here.
 */
export function createLightweightChartsV5TrendLineDraftInteractionFromBinding(
  binding: Pick<LightweightChartsV5DriverBinding, 'resolveChart' | 'resolveSeries'>,
  handle: ChartEngineSeriesHandle,
  onStateChange: ChartDrawingInteractionStateListener,
  getCurrentRendererDrawings?: () => readonly RendererChartDrawing[],
  editEndpointClick?: LightweightChartsV5TrendLineEditEndpointClickLifecycleOptions,
  editExecution?: LightweightChartsV5TrendLineEditClickExecutionLifecycleOptions,
): ChartTrendLineDraftInteractionSession {
  const draftInteraction = createChartTrendLineDraftInteractionPort().create(onStateChange);
  let routeProjectedAnchorToExistingEdit = false;

  const acceptProjectedAnchor = (anchor: Parameters<ChartTrendLineDraftInteractionSession['acceptAnchor']>[0]): void => {
    const shouldExecuteEdit = routeProjectedAnchorToExistingEdit;
    routeProjectedAnchorToExistingEdit = false;

    if (shouldExecuteEdit && editExecution !== undefined) {
      if (anchor === null) return;
      executeChartTrendLineEditAndRefreshPresentation(
        draftInteraction,
        editExecution.collection,
        editExecution.presentation,
        anchor,
      );
      return;
    }

    draftInteraction.acceptAnchor(anchor);
  };

  let clickSubscription: LightweightChartsV5DrawingClickSubscription;
  try {
    if (getCurrentRendererDrawings === undefined) {
      clickSubscription = createLightweightChartsV5DrawingClickSubscriptionFromBinding(
        binding,
        handle,
        acceptProjectedAnchor,
        editEndpointClick === undefined && editExecution === undefined
          ? undefined
          : (event) => {
              routeProjectedAnchorToExistingEdit =
                editExecution !== undefined && draftInteraction.getState().status === 'editing';

              if (editEndpointClick !== undefined) {
                coordinateLightweightChartsV5TrendLineEditEndpointClick(
                  draftInteraction,
                  editEndpointClick.getCurrentSegments(),
                  event,
                  editEndpointClick.tolerancePx,
                );
              }
            },
      );
    } else {
      clickSubscription = createLightweightChartsV5DrawingClickSubscriptionFromBinding(
        binding,
        handle,
        acceptProjectedAnchor,
        (event) => {
          routeProjectedAnchorToExistingEdit =
            editExecution !== undefined && draftInteraction.getState().status === 'editing';

          if (editEndpointClick !== undefined) {
            coordinateLightweightChartsV5TrendLineEditEndpointClick(
              draftInteraction,
              editEndpointClick.getCurrentSegments(),
              event,
              editEndpointClick.tolerancePx,
            );
          }

          if (getCurrentRendererDrawings !== undefined) {
            coordinateLightweightChartsV5DrawingSelectionInteraction(
              draftInteraction,
              getCurrentRendererDrawings(),
              event,
            );
          }
        },
      );
    }
  } catch (error) {
    draftInteraction.destroy();
    throw error;
  }

  let destroyed = false;

  return {
    getState() {
      return draftInteraction.getState();
    },
    getAnchors() {
      return draftInteraction.getAnchors();
    },
    dispatch(event) {
      return draftInteraction.dispatch(event);
    },
    acceptAnchor(anchor) {
      return draftInteraction.acceptAnchor(anchor);
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      clickSubscription.destroy();
      draftInteraction.destroy();
    },
  };
}
