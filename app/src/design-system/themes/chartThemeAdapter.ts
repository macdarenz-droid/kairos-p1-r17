import type { ThemeId } from './themeEngine';
import { themeRegistry } from './themeEngine';

export type ChartTheme = Readonly<{
  background: string;
  grid: string;
  axis: string;
  crosshair: string;
  candleUp: string;
  candleDown: string;
  wickUp: string;
  wickDown: string;
  volumeUp: string;
  volumeDown: string;
  drawingPrimary: string;
  drawingSecondary: string;
  support: string;
  resistance: string;
}>;

const chartTokenKeys = Object.freeze({
  background: '--kairos-chart-background',
  grid: '--kairos-chart-grid',
  axis: '--kairos-chart-axis',
  crosshair: '--kairos-chart-crosshair',
  candleUp: '--kairos-chart-candle-up',
  candleDown: '--kairos-chart-candle-down',
  wickUp: '--kairos-chart-wick-up',
  wickDown: '--kairos-chart-wick-down',
  volumeUp: '--kairos-chart-volume-up',
  volumeDown: '--kairos-chart-volume-down',
  drawingPrimary: '--kairos-chart-drawing-primary',
  drawingSecondary: '--kairos-chart-drawing-secondary',
  support: '--kairos-chart-support',
  resistance: '--kairos-chart-resistance',
} as const);

export const chartThemeTokenKeys: Readonly<typeof chartTokenKeys> = chartTokenKeys;

export function getChartTheme(themeId: ThemeId): ChartTheme {
  const tokens = themeRegistry[themeId].tokens;
  const entries = Object.entries(chartTokenKeys).map(([role, token]) => {
    const value = tokens[token];
    if (!value) throw new Error(`Theme ${themeId} is missing required chart token ${token}.`);
    return [role, value] as const;
  });
  return Object.freeze(Object.fromEntries(entries) as ChartTheme);
}
