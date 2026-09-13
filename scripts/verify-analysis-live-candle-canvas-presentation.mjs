import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/app/AnalysisLiveCandleCanvas.tsx', import.meta.url), 'utf8');
const tests = readFileSync(new URL('../tests/analysis-live-candle-canvas-presentation.test.tsx', import.meta.url), 'utf8');
const report = readFileSync(new URL('../docs/KAIROS_ANALYSIS_LIVE_CANDLE_CANVAS_PRESENTATION.md', import.meta.url), 'utf8');

for (const expected of [
  'useAnalysisLiveCandleRouteSession',
  'presentAnalysisLiveCandleStatus',
  'data-live-candle-status',
  'aria-live',
  'current.pan(-.2)',
  'binding.zoom(1.25)',
  'binding.zoom(.8)',
  'binding.resetView',
  'props.instrument.symbol',
  'props.interval',
]) {
  if (!source.includes(expected)) throw new Error(`missing live-canvas presentation evidence: ${expected}`);
}

for (const forbidden of [
  'AnalysisHistoryWorkspace', 'AnalysisRoute', 'analysisHistoryPorts', 'acquireHistory(',
  'new WebSocket', 'fetch(', 'indexedDB', 'localStorage', 'Decimal(', 'calculate',
  'profit', 'pnl', 'execution', 'createAnalysisLiveCandleRouteSession',
]) {
  if (source.includes(forbidden)) throw new Error(`forbidden live-canvas owner expansion: ${forbidden}`);
}

if (!tests.includes('binds the exact selected scope to the real chart container without mounting the Analysis route')) throw new Error('missing exact-scope/container test');
if (!tests.includes('delegates buttons and keyboard commands to the released viewport controls')) throw new Error('missing viewport delegation test');
if (!tests.includes('never substitutes generic raw error copy')) throw new Error('missing safe status-copy test');
if (!report.includes('UI visible: no')) throw new Error('component must remain unmounted in this slice');

console.log('Analysis live-candle canvas presentation verification passed.');
