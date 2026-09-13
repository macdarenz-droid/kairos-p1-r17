import { existsSync, readFileSync } from 'node:fs';

const sessionPath = 'src/app/analysisCandleRendererSession.ts';
const canvasPath = 'src/app/AnalysisCandleCanvas.tsx';
const testPath = 'tests/analysis-candle-renderer-session.test.ts';
for (const file of [sessionPath, canvasPath, testPath]) {
  if (!existsSync(file)) throw new Error(`missing-analysis-candle-renderer-session:${file}`);
}

const session = readFileSync(sessionPath, 'utf8');
const canvas = readFileSync(canvasPath, 'utf8');
const test = readFileSync(testPath, 'utf8');

for (const token of [
  'createLightweightChartsV5ProductionRendererFactory',
  'PresentedChartRenderer',
  'MarketCandleHistorySnapshot',
  'session.setTheme(getChartTheme(themeId))',
  'venue: snapshot.request.instrument.venue',
  'instrument: snapshot.request.instrument.symbol',
  'source: snapshot.source',
  "series: { kind: 'candles', candles: snapshot.candles }",
  'journalExecutions: []',
  'session.showRecent(80)',
  'return session',
  'session.destroy()',
  'throw error',
]) if (!session.includes(token)) throw new Error(`analysis-candle-renderer-session-drift:${token}`);

for (const token of [
  "from './analysisCandleRendererSession'",
  'createAnalysisCandleRendererSession({ container: container.current, snapshot, themeId: latestTheme.current })',
  'renderer.current = session',
  'renderer.current = null; session?.destroy()',
]) if (!canvas.includes(token)) throw new Error(`analysis-canvas-handoff-drift:${token}`);

for (const forbidden of [
  'WebSocket', 'fetch(', 'setTimeout(', 'setInterval(', 'Math.random(', 'Date.now(',
  'indexedDB', 'localStorage', 'Dexie', 'createTrade', 'updateTrade', 'calculateTrade',
  'createSeriesMarkers', 'AnalysisRoute', 'useEffect', 'useState',
]) if (session.includes(forbidden)) throw new Error(`analysis-candle-renderer-session-ownership-violation:${forbidden}`);

for (const token of [
  'returns the same incremental renderer',
  'returned.updateLatestCandle',
  'toBe(renderer)',
  'destroy).toHaveBeenCalledTimes(1)',
  'authoritative-render-failed',
]) if (!test.includes(token)) throw new Error(`missing-analysis-candle-renderer-session-evidence:${token}`);

console.log('Analysis candle renderer session verifier PASS');
