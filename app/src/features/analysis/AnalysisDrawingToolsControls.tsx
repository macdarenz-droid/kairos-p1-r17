import type { ChartDrawingInteractionState, ChartDrawingKind } from '../chart';

export interface AnalysisDrawingToolsControlsProps {
  readonly state: ChartDrawingInteractionState | null;
  readonly drawingCount: number;
  readonly onSelectTrendLine: () => void;
  readonly onCancel: () => void;
  readonly onDeleteSelected: () => void;
  /** Shows the "Zone" button when given. */
  readonly onSelectZone?: () => void;
  /** How many of `drawingCount` are zones. */
  readonly zoneCount?: number;
  /** The kind of the drawing the current state names, if any. */
  readonly selectedKind?: ChartDrawingKind | null;
}

const trendLineGuidance = (state: ChartDrawingInteractionState | null): string => {
  switch (state?.status) {
    case 'tool-selected': return 'Trend line: click the first point on the chart.';
    case 'drawing': return 'Trend line: click the second point to place it.';
    case 'preview': return 'Trend line: placing.';
    case 'committed': return 'Trend line placed. Click a line to select it.';
    case 'selected': return 'Line selected. Delete removes it.';
    case 'editing': return 'Moving an endpoint: click where it should go. Cancel keeps the line.';
    case 'deleting': return 'Deleting the selected line.';
    case 'cancelled': return 'Drawing cancelled.';
    case 'idle': return 'Tap a line or zone to select it.';
    default: return 'Drawing tools are ready once the chart is live.';
  }
};

const zoneGuidance = (status: ChartDrawingInteractionState['status']): string | null => {
  switch (status) {
    case 'tool-selected': return 'Zone: tap the first corner on the chart.';
    case 'drawing': return 'Zone: tap the opposite corner to place it.';
    case 'preview': return 'Zone: placing.';
    case 'committed': return 'Zone placed. Tap it to select it.';
    case 'selected': return 'Zone selected. Tap one of its corner squares, then tap where it should go. Delete removes it.';
    case 'editing': return 'Moving a corner: tap where it should go. Cancel keeps the zone.';
    default: return null;
  }
};

function guidance(state: ChartDrawingInteractionState | null, selectedKind: ChartDrawingKind | null): string {
  if (state !== null) {
    const kind = 'tool' in state ? state.tool : selectedKind;
    if (kind === 'zone') return zoneGuidance(state.status) ?? trendLineGuidance(state);
  }
  return trendLineGuidance(state);
}

function countSentence(drawingCount: number, zoneCount: number): string {
  const lines = drawingCount - zoneCount;
  const parts = [
    lines > 0 ? (lines === 1 ? '1 line' : `${lines} lines`) : null,
    zoneCount > 0 ? (zoneCount === 1 ? '1 zone' : `${zoneCount} zones`) : null,
  ].filter(Boolean);
  return `${parts.length === 0 ? '0 lines' : parts.join(' · ')} on this chart.`;
}

/** Toolbar for the released P18 drawing session: no drawing truth, only commands and the exact interaction status. */
export function AnalysisDrawingToolsControls({ state, drawingCount, onSelectTrendLine, onCancel, onDeleteSelected, onSelectZone, zoneCount = 0, selectedKind = null }: AnalysisDrawingToolsControlsProps) {
  const drafting = state?.status === 'tool-selected' || state?.status === 'drawing' || state?.status === 'preview';
  const draftTool = drafting && state !== null && 'tool' in state ? state.tool : null;
  const selected = state?.status === 'selected';
  const editing = state?.status === 'editing';
  // A state that names a drawing without a known kind keeps the released "Delete line" wording.
  const namesDrawing = state !== null && 'drawingId' in state;
  const deleteLabel = selectedKind === 'zone' ? 'Delete zone' : selectedKind === 'trend-line' || namesDrawing ? 'Delete line' : 'Delete';
  return <div className="kairos-analysis-chart__drawing-tools" role="group" aria-label="Drawing tools" data-drawing-status={state?.status ?? 'unavailable'} data-drawing-count={drawingCount} data-zone-count={zoneCount}>
    <button type="button" aria-pressed={draftTool === 'trend-line'} disabled={state === null} onClick={onSelectTrendLine}>Trend line</button>
    {onSelectZone ? <button type="button" aria-pressed={draftTool === 'zone'} disabled={state === null} onClick={onSelectZone}>Zone</button> : null}
    <button type="button" disabled={!drafting && !selected && !editing} onClick={onCancel}>Cancel</button>
    <button type="button" disabled={!selected} onClick={onDeleteSelected}>{deleteLabel}</button>
    <span className="kairos-analysis-chart__note" aria-live="polite" data-drawing-guidance="true">{guidance(state, selectedKind)} {countSentence(drawingCount, zoneCount)}</span>
  </div>;
}
