import type { ChartDrawingInteractionState } from '../chart';

export interface AnalysisDrawingToolsControlsProps {
  readonly state: ChartDrawingInteractionState | null;
  readonly drawingCount: number;
  readonly onSelectTrendLine: () => void;
  readonly onCancel: () => void;
  readonly onDeleteSelected: () => void;
}

const guidance = (state: ChartDrawingInteractionState | null): string => {
  switch (state?.status) {
    case 'tool-selected': return 'Trend line: click the first point on the chart.';
    case 'drawing': return 'Trend line: click the second point to place it.';
    case 'preview': return 'Trend line: placing.';
    case 'committed': return 'Trend line placed. Click a line to select it.';
    case 'selected': return 'Line selected. Delete removes it.';
    case 'editing': return 'Moving an endpoint: click where it should go. Cancel keeps the line.';
    case 'deleting': return 'Deleting the selected line.';
    case 'cancelled': return 'Drawing cancelled.';
    case 'idle': return 'Click a placed line to select it.';
    default: return 'Drawing tools are ready once the chart is live.';
  }
};

/** Toolbar for the released P18 drawing session: no drawing truth, only commands and the exact interaction status. */
export function AnalysisDrawingToolsControls({ state, drawingCount, onSelectTrendLine, onCancel, onDeleteSelected }: AnalysisDrawingToolsControlsProps) {
  const drafting = state?.status === 'tool-selected' || state?.status === 'drawing' || state?.status === 'preview';
  const selected = state?.status === 'selected';
  const editing = state?.status === 'editing';
  return <div className="kairos-analysis-chart__drawing-tools" role="group" aria-label="Drawing tools" data-drawing-status={state?.status ?? 'unavailable'} data-drawing-count={drawingCount}>
    <button type="button" aria-pressed={drafting} disabled={state === null} onClick={onSelectTrendLine}>Trend line</button>
    <button type="button" disabled={!drafting && !selected && !editing} onClick={onCancel}>Cancel</button>
    <button type="button" disabled={!selected} onClick={onDeleteSelected}>Delete line</button>
    <span className="kairos-analysis-chart__note" aria-live="polite" data-drawing-guidance="true">{guidance(state)} {drawingCount === 1 ? '1 line' : `${drawingCount} lines`} on this chart.</span>
  </div>;
}
