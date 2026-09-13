import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/app/analysisLiveCandleStatusPresentation.ts', import.meta.url), 'utf8');
const tests = readFileSync(new URL('../tests/analysis-live-candle-status-presentation.test.ts', import.meta.url), 'utf8');
const report = readFileSync(new URL('../docs/KAIROS_ANALYSIS_LIVE_CANDLE_STATUS_PRESENTATION.md', import.meta.url), 'utf8');

for (const expected of [
  'presentAnalysisLiveCandleStatus',
  "connection === 'live'",
  "availability === 'hidden'",
  "availability === 'offline'",
  "result.reason === 'history-failed'",
  "result.reason === 'history-scope-mismatch'",
  "result.reason === 'renderer-failed'",
  "disposition?.kind === 'backfill-required'",
  'Object.freeze',
]) {
  if (!source.includes(expected)) throw new Error(`missing status projection evidence: ${expected}`);
}

for (const forbidden of [
  'useEffect', 'useState', 'react', 'document.', 'window.', 'localStorage', 'indexedDB',
  'new WebSocket', 'fetch(', 'acquireHistory(', 'createAnalysisLiveCandleRouteSession',
  'Decimal(', 'calculate', 'profit', 'pnl', 'execution',
]) {
  if (source.includes(forbidden)) throw new Error(`forbidden status owner expansion: ${forbidden}`);
}

if (!tests.includes('requires the exact live connection state before claiming live candles')) throw new Error('missing live-claim test');
if (!tests.includes('does not expose transport or provider error objects in visible copy')) throw new Error('missing safe-error-copy test');
if (!report.includes('UI visible: no')) throw new Error('status projection must remain unmounted');

console.log('Analysis live-candle status presentation verification passed.');
