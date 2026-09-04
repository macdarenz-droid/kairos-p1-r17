import { readFileSync } from 'node:fs';

const production = readFileSync('src/features/chart/chartDrawingCollectionPresentationCoordination.ts', 'utf8');
const index = readFileSync('src/features/chart/index.ts', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const test = readFileSync('tests/chart-drawing-collection-presentation-coordination.test.ts', 'utf8');

const requiredProduction = [
  "import type { ChartDrawingCollectionSession } from './chartDrawingCollection';",
  "import type { ChartDrawingPresentationSession } from './chartDrawingPresentationPort';",
  "import { projectChartDrawings } from './chartDrawingProjection';",
  'replaceChartDrawingPresentationFromCollection(',
  'projectChartDrawings(collection.getDrawings())',
  'presentation.replace(series, drawings)',
];
for (const token of requiredProduction) {
  if (!production.includes(token)) throw new Error(`P18.37 production token missing: ${token}`);
}

const forbidden = [
  'createChartDrawingId',
  'commitChartTrendLineDraft',
  'addDrawing(',
  'IndexedDB',
  'Dexie',
  'localStorage',
  'lightweight-charts',
  'coordinateToPrice',
  'dispatch(',
  'riskReward',
];
for (const token of forbidden) {
  if (production.includes(token)) throw new Error(`P18.37 forbidden ownership token present: ${token}`);
}

if (!index.includes("export { replaceChartDrawingPresentationFromCollection } from './chartDrawingCollectionPresentationCoordination';")) {
  throw new Error('P18.37 index export missing');
}
if (pkg.scripts?.['verify:p18:37-chart-drawing-collection-presentation-coordination'] !== 'node scripts/verify-p18-37-chart-drawing-collection-presentation-coordination.mjs') {
  throw new Error('P18.37 package verifier registration missing');
}
for (const token of ['projects one committed collection snapshot in insertion order', 'presents an empty renderer drawing snapshot', 'fails closed before presentation']) {
  if (!test.includes(token)) throw new Error(`P18.37 runtime evidence missing: ${token}`);
}

console.log('PASS P18.37 chart drawing collection presentation coordination verifier');
