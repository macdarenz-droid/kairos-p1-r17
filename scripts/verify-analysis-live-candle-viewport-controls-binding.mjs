import { existsSync, readFileSync } from 'node:fs';

const hookPath = 'src/app/useAnalysisLiveCandleRouteSession.ts';
const testPath = 'tests/analysis-live-candle-viewport-controls-binding.test.tsx';
const docPath = 'docs/KAIROS_ANALYSIS_LIVE_CANDLE_VIEWPORT_CONTROLS_BINDING.md';
for (const file of [hookPath, testPath, docPath]) {
  if (!existsSync(file)) throw new Error(`missing-analysis-live-candle-viewport-controls-binding:${file}`);
}

const hook = readFileSync(hookPath, 'utf8');
const test = readFileSync(testPath, 'utf8');
const doc = readFileSync(docPath, 'utf8');

for (const token of [
  'AnalysisLiveCandleReactBindingResult extends AnalysisLiveCandleReactBindingState',
  'session.current?.currentRenderer()?.pan(fraction)',
  'session.current?.currentRenderer()?.zoom(factor)',
  'session.current?.currentRenderer()?.resetView()',
  'return { ...state, pan, zoom, resetView }',
]) if (!hook.includes(token)) throw new Error(`analysis-live-candle-viewport-controls-binding-drift:${token}`);

for (const forbidden of [
  'createLightweightChartsV5ProductionRendererFactory', 'createAnalysisCandleRendererSession',
  'AnalysisHistoryWorkspace', 'AnalysisCandleCanvas', 'AnalysisRoute',
  'WebSocket', 'fetch(', 'setTimeout(', 'setInterval(', 'indexedDB', 'localStorage',
  'createTrade', 'updateTrade', 'calculateTrade', 'Loading candles', 'Live candles',
]) if (hook.includes(forbidden)) throw new Error(`analysis-live-candle-viewport-controls-ownership-violation:${forbidden}`);

for (const token of [
  'delegates exact viewport commands to the released current renderer',
  'keeps viewport commands inert before a renderer exists and after unmount',
  'toHaveBeenCalledWith(-0.2)',
  'toHaveBeenCalledWith(0.8)',
]) if (!test.includes(token)) throw new Error(`missing-analysis-live-candle-viewport-controls-evidence:${token}`);

for (const token of [
  'UI visible: no', 'Gate431', 'Gate430', 'does not choose viewport numeric policy',
]) if (!doc.includes(token)) throw new Error(`analysis-live-candle-viewport-controls-doc-drift:${token}`);

console.log('Analysis live candle viewport controls binding verifier PASS');
