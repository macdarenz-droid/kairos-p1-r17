export interface ChartVisibleLogicalRange {
  readonly from: number;
  readonly to: number;
}

export type ChartVisibleLogicalRangeListener = (
  range: ChartVisibleLogicalRange | null,
) => void;

export interface ChartVisibleRangePort {
  getVisibleLogicalRange(): ChartVisibleLogicalRange | null;
  subscribeVisibleLogicalRangeChange(
    listener: ChartVisibleLogicalRangeListener,
  ): () => void;
}

/** A time window in epoch milliseconds. */
export interface ChartVisibleTimeRange {
  readonly fromMs: number;
  readonly toMs: number;
}

/** A visible-range port that can also move the view to a time window. */
export interface ChartVisibleTimeRangePort extends ChartVisibleRangePort {
  /** Scrolls and zooms to the window; the user can still scroll and zoom afterwards. False when the chart cannot. */
  setVisibleTimeRange(range: ChartVisibleTimeRange): boolean;
}
