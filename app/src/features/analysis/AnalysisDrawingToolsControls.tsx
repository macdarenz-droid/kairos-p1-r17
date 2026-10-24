import type { ChartDrawingInteractionState, ChartDrawingTool } from '../chart';

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
  readonly selectedKind?: ChartDrawingTool | null;
  /** Shows the "Risk box" button when given. */
  readonly onSelectRiskBox?: () => void;
  readonly riskBoxCount?: number;
  /** The selected risk box's label, if a box is selected. */
  readonly selectedLabel?: string | null;
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

const riskBoxGuidance = (status: ChartDrawingInteractionState['status'], label: string | null): string | null => {
  switch (status) {
    case 'tool-selected': return 'Risk box: tap your entry price on the chart.';
    case 'drawing': return 'Risk box: tap your stop a few candles to the right. Below the entry makes a long (buy) box; above makes a short (sell) box.';
    case 'preview': return 'Risk box: tap your target, on the other side of the entry from the stop.';
    case 'committed': return 'Risk box placed. Tap it to select it.';
    case 'selected': return `Risk box selected: ${label ?? 'risk box'}. Tap a square to move the entry, stop or target, or Delete to remove it.`;
    case 'editing': return 'Moving the risk box: tap where it should go. The stop and target must stay on their own sides of the entry. Cancel keeps the box.';
    default: return null;
  }
};

function guidance(state: ChartDrawingInteractionState | null, selectedKind: ChartDrawingTool | null, selectedLabel: string | null): string {
  if (state !== null) {
    const kind = 'tool' in state ? state.tool : selectedKind;
    if (kind === 'zone') return zoneGuidance(state.status) ?? trendLineGuidance(state);
    if (kind === 'risk-box') return riskBoxGuidance(state.status, selectedLabel) ?? trendLineGuidance(state);
  }
  return trendLineGuidance(state);
}

function countSentence(drawingCount: number, zoneCount: number, riskBoxCount: number): string {
  const lines = drawingCount - zoneCount;
  const parts = [
    lines > 0 ? (lines === 1 ? '1 line' : `${lines} lines`) : null,
    zoneCount > 0 ? (zoneCount === 1 ? '1 zone' : `${zoneCount} zones`) : null,
  ].filter(Boolean);
  const boxes = riskBoxCount > 0 ? (riskBoxCount === 1 ? ' · 1 risk box' : ` · ${riskBoxCount} risk boxes`) : '';
  return `${parts.length === 0 ? '0 lines' : parts.join(' · ')}${boxes} on this chart.`;
}

/** Toolbar for the released P18 drawing session: no drawing truth, only commands and the exact interaction status. */
export function AnalysisDrawingToolsControls({ state, drawingCount, onSelectTrendLine, onCancel, onDeleteSelected, onSelectZone, zoneCount = 0, selectedKind = null, onSelectRiskBox, riskBoxCount = 0, selectedLabel = null }: AnalysisDrawingToolsControlsProps) {
  const drafting = state?.status === 'tool-selected' || state?.status === 'drawing' || state?.status === 'preview';
  const draftTool = drafting && state !== null && 'tool' in state ? state.tool : null;
  const selected = state?.status === 'selected';
  const editing = state?.status === 'editing';
  // A state that names a drawing without a known kind keeps the released "Delete line" wording.
  const namesDrawing = state !== null && 'drawingId' in state;
  const deleteLabel = selectedKind === 'risk-box' ? 'Delete risk box' : selectedKind === 'zone' ? 'Delete zone' : selectedKind === 'trend-line' || namesDrawing ? 'Delete line' : 'Delete';
  return <div className="kairos-analysis-chart__drawing-tools" role="group" aria-label="Drawing tools" data-drawing-status={state?.status ?? 'unavailable'} data-drawing-count={drawingCount} data-zone-count={zoneCount} data-risk-box-count={riskBoxCount}>
    <button type="button" aria-pressed={draftTool === 'trend-line'} disabled={state === null} onClick={onSelectTrendLine}>Trend line</button>
    {onSelectZone ? <button type="button" aria-pressed={draftTool === 'zone'} disabled={state === null} onClick={onSelectZone}>Zone</button> : null}
    {onSelectRiskBox ? <button type="button" aria-pressed={draftTool === 'risk-box'} disabled={state === null} onClick={onSelectRiskBox}>Risk box</button> : null}
    <button type="button" disabled={!drafting && !selected && !editing} onClick={onCancel}>Cancel</button>
    <button type="button" disabled={!selected} onClick={onDeleteSelected}>{deleteLabel}</button>
    <span className="kairos-analysis-chart__note" aria-live="polite" data-drawing-guidance="true">{guidance(state, selectedKind, selectedLabel)} {countSentence(drawingCount, zoneCount, riskBoxCount)}</span>
  </div>;
}
