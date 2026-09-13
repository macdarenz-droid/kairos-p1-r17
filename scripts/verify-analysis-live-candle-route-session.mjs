import { existsSync, readFileSync } from 'node:fs';

const sessionPath = 'src/app/analysisLiveCandleRouteSession.ts';
const testPath = 'tests/analysis-live-candle-route-session.test.ts';
for (const file of [sessionPath, testPath]) {
  if (!existsSync(file)) throw new Error(`missing-analysis-live-candle-route-session:${file}`);
}

const session = readFileSync(sessionPath, 'utf8');
const test = readFileSync(testPath, 'utf8');

for (const token of [
  'createBinanceAnalysisLiveCandleProductionLifecycle',
  'createAnalysisCandleRendererSession',
  'ANALYSIS_LIVE_CANDLE_HISTORY_LIMIT',
  'ANALYSIS_LIVE_CANDLE_RECONNECT_POLICY',
  'historyLimit: ANALYSIS_LIVE_CANDLE_HISTORY_LIMIT',
  'reconnectPolicy: ANALYSIS_LIVE_CANDLE_RECONNECT_POLICY',
  'renderHistory(snapshot)',
  'container: next.container',
  'snapshot,',
  'themeId: themeId ?? next.themeId',
  'renderer = created',
  'return created',
  "created.destroy()",
  'previous?.destroy()',
  'lifecycle.close()',
  'renderer?.setTheme(getChartTheme(nextThemeId))',
  "return { ok: false, reason: 'superseded' }",
]) if (!session.includes(token)) throw new Error(`analysis-live-candle-route-session-drift:${token}`);

for (const forbidden of [
  'useEffect', 'useState', 'AnalysisRoute', 'AnalysisHistoryWorkspace', 'AnalysisCandleCanvas',
  'WebSocket', 'fetch(', 'setTimeout(', 'setInterval(', 'Math.random(', 'Date.now(',
  'indexedDB', 'localStorage', 'Dexie', 'createTrade', 'updateTrade', 'calculateTrade',
  'createSeriesMarkers', 'journalExecutions:',
]) if (session.includes(forbidden)) throw new Error(`analysis-live-candle-route-session-ownership-violation:${forbidden}`);

for (const token of [
  'supplies exact product policy',
  'invalidates the old selection before replacement',
  'uses the latest route theme',
  'fails closed after activation or authoritative recovery failure',
  'forwards browser resume observations only to the current selection',
  'closes lifecycle and renderer once',
  'historyLimit).toBe(500)',
  'maxAttempts: 4',
  'toHaveBeenCalledTimes(1)',
]) if (!test.includes(token)) throw new Error(`missing-analysis-live-candle-route-session-evidence:${token}`);

console.log('Analysis live candle route session verifier PASS');
