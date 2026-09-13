import { existsSync, readFileSync } from 'node:fs';

const hookPath = 'src/app/useAnalysisLiveCandleRouteSession.ts';
const testPath = 'tests/analysis-live-candle-react-binding.test.tsx';
const docPath = 'docs/KAIROS_ANALYSIS_LIVE_CANDLE_REACT_BINDING.md';
for (const file of [hookPath, testPath, docPath]) {
  if (!existsSync(file)) throw new Error(`missing-analysis-live-candle-react-binding:${file}`);
}

const hook = readFileSync(hookPath, 'utf8');
const test = readFileSync(testPath, 'utf8');
const doc = readFileSync(docPath, 'utf8');

for (const token of [
  "from './analysisLiveCandleRouteSession'",
  'createSession = createAnalysisLiveCandleRouteSession',
  'created.close()',
  'currentSession.replace({',
  'instrument: latestInstrument.current',
  'themeId: latestThemeId.current',
  'currentSession.availability()',
  'session.current?.setTheme(themeId)',
  'onAvailabilityChange:',
  'onActivationResult:',
  'onStateChange:',
  'onDisposition:',
  'onBackfillRequired:',
  'onBackfillRecovery:',
  'onError:',
  'generation.current === ticket',
]) if (!hook.includes(token)) throw new Error(`analysis-live-candle-react-binding-drift:${token}`);

for (const forbidden of [
  'AnalysisHistoryWorkspace', 'AnalysisCandleCanvas', 'AnalysisRoute',
  'WebSocket', 'fetch(', 'setTimeout(', 'setInterval(', 'Math.random(', 'Date.now(',
  'indexedDB', 'localStorage', 'Dexie', 'createTrade', 'updateTrade', 'calculateTrade',
  'Loading candles', 'Live candles', 'Connected', 'Disconnected', 'createSeriesMarkers',
]) if (hook.includes(forbidden)) throw new Error(`analysis-live-candle-react-binding-ownership-violation:${forbidden}`);

for (const token of [
  'mounts one released route session',
  'retains exact lifecycle observations',
  'records exact activation success',
  'updates theme without reacquiring',
  'suppresses superseded callbacks and completion',
  'uses caller revision for refresh',
  'closes once on unmount',
  'synchronous session construction failure',
]) if (!test.includes(token)) throw new Error(`missing-analysis-live-candle-react-binding-evidence:${token}`);

for (const token of [
  'UI visible: no',
  'Gate430',
  'exact raw lifecycle observations',
  'does not mount the Analysis route',
]) if (!doc.includes(token)) throw new Error(`analysis-live-candle-react-binding-doc-drift:${token}`);

console.log('Analysis live candle React binding verifier PASS');
