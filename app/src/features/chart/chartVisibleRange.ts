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
