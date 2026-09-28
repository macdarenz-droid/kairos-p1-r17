/** Risk/reward box geometry in CSS pixels: one shared left/right extent and three level heights. */
export interface LightweightChartsV5RiskRewardBoxGeometry {
  readonly startX: number;
  readonly endX: number;
  readonly entryY: number;
  readonly stopY: number;
  readonly targetY: number;
}

export interface LightweightChartsV5RiskRewardBoxColors {
  readonly entry: string;
  readonly stop: string;
  readonly target: string;
  readonly risk: string;
  readonly reward: string;
}

/** The canvas calls the paint needs; a subset of CanvasRenderingContext2D so tests can pass a plain fake. */
export interface LightweightChartsV5RiskRewardBoxPaintContext {
  save(): void;
  restore(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  globalAlpha: number;
  lineWidth: number;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
}

/**
 * The one risk/reward box paint, shared by the saved-trade box and the
 * user-drawn box so both look the same while their truths stay apart.
 * Draws in bitmap space: the risk zone (entry→stop) and reward zone
 * (entry→target) at `zoneOpacity`, signs kept, then the entry, stop and
 * target lines at full opacity, in that order.
 */
export function paintLightweightChartsV5RiskRewardBox(
  context: LightweightChartsV5RiskRewardBoxPaintContext,
  horizontalPixelRatio: number,
  verticalPixelRatio: number,
  geometry: LightweightChartsV5RiskRewardBoxGeometry,
  colors: LightweightChartsV5RiskRewardBoxColors,
  lineWidth: number,
  zoneOpacity: number,
): void {
  const { startX, endX, entryY, stopY, targetY } = geometry;
  context.save();
  try {
    context.globalAlpha = zoneOpacity;
    for (const [edgeY, color] of [[stopY, colors.risk], [targetY, colors.reward]] as const) {
      context.fillStyle = color;
      context.fillRect(
        startX * horizontalPixelRatio,
        entryY * verticalPixelRatio,
        (endX - startX) * horizontalPixelRatio,
        (edgeY - entryY) * verticalPixelRatio,
      );
    }

    context.globalAlpha = 1;
    context.lineWidth = Math.max(1, Math.round(lineWidth * horizontalPixelRatio));
    for (const [levelY, color] of [[entryY, colors.entry], [stopY, colors.stop], [targetY, colors.target]] as const) {
      context.strokeStyle = color;
      context.beginPath();
      context.moveTo(startX * horizontalPixelRatio, levelY * verticalPixelRatio);
      context.lineTo(endX * horizontalPixelRatio, levelY * verticalPixelRatio);
      context.stroke();
    }
  } finally {
    context.restore();
  }
}
