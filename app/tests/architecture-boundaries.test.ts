// @vitest-environment node
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob('../src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

type ImportPair = readonly [from: string, to: string];

const IMPORT_PATTERN = /(?:from\s*|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;

const ALLOWLIST: readonly ImportPair[] = [
  ['app/analysisSavedTradeLightweightChartsV5MarkerBinding.ts', 'lightweight-charts'],
  ['app/analysisSavedTradeRiskRewardCanvasPaneRenderer.ts', 'lightweight-charts'],
  ['app/analysisSavedTradeRiskRewardLightweightChartsV5Primitive.ts', 'lightweight-charts'],
  ['app/analysisTimeAssistedMarkerBinding.ts', 'lightweight-charts'],
];

function toSrcPath(globKey: string): string {
  return globKey.replace(/^\.\.\/src\//, '');
}

function resolveRelative(fromFile: string, specifier: string): string {
  const parts = fromFile.split('/').slice(0, -1);
  for (const segment of specifier.split('/')) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return parts.join('/').replace(/\.(tsx?|jsx?|mjs|cjs)$/, '');
}

function packageName(specifier: string): string {
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

interface ImportEdge {
  readonly pair: ImportPair;
  readonly relative: boolean;
}

function collectImportEdges(): ImportEdge[] {
  const edges = new Map<string, ImportEdge>();
  for (const [key, source] of Object.entries(sources)) {
    const from = toSrcPath(key);
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1];
      const relative = specifier.startsWith('.');
      const pair: ImportPair = [from, relative ? resolveRelative(from, specifier) : packageName(specifier)];
      edges.set(pairKey(pair), { pair, relative });
    }
  }
  return [...edges.values()];
}

function inside(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

function isAppLayer(path: string): boolean {
  return inside(path, 'app') || path === 'main.tsx' || path === 'main';
}

const PACKAGE_OWNERS: ReadonlyArray<{ readonly pkg: string; readonly allowed: (from: string) => boolean }> = [
  { pkg: 'dexie', allowed: (from) => inside(from, 'data/database') },
  { pkg: 'decimal.js', allowed: (from) => from === 'domain/calculations/decimalKernel.ts' },
  { pkg: 'lightweight-charts', allowed: (from) => inside(from, 'features/chart') },
];

function violatedRules(from: string, to: string, relative: boolean): string[] {
  const rules: string[] = [];
  if (!relative) {
    for (const owner of PACKAGE_OWNERS) {
      if (to === owner.pkg && !owner.allowed(from)) rules.push(`${owner.pkg} is imported only by its owner`);
    }
    return rules;
  }
  if (inside(from, 'domain') && !inside(to, 'domain')) rules.push('domain imports stay inside domain');
  if (inside(from, 'data') && (inside(to, 'application') || inside(to, 'features') || isAppLayer(to))) {
    rules.push('data never imports application, features or app');
  }
  if (!isAppLayer(from) && isAppLayer(to)) rules.push('only app imports app');
  if (inside(from, 'shared') && !inside(to, 'shared')) rules.push('shared imports only shared');
  if ((inside(from, 'application') || inside(from, 'domain') || inside(from, 'data')) && inside(to, 'services/market-data/providers')) {
    rules.push('application, domain and data never import a market-data provider');
  }
  return rules;
}

function findViolations(): { key: string; pair: ImportPair; rules: string[] }[] {
  return collectImportEdges()
    .map(({ pair, relative }) => ({ key: pairKey(pair), pair, rules: violatedRules(pair[0], pair[1], relative) }))
    .filter((violation) => violation.rules.length > 0);
}

const pairKey = (pair: ImportPair) => `${pair[0]}\u0000${pair[1]}`;
const describePair = (pair: ImportPair) => `${pair[0]} -> ${pair[1]}`;

describe('architecture boundaries', () => {
  it('reads the source tree', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    expect(collectImportEdges().length).toBeGreaterThan(100);
  });

  it('allows no layer violation outside the allowlist', () => {
    const allowed = new Set(ALLOWLIST.map(pairKey));
    const unexpected = findViolations()
      .filter((violation) => !allowed.has(violation.key))
      .map((violation) => `${describePair(violation.pair)} (${violation.rules.join('; ')})`);
    expect(unexpected).toEqual([]);
  });

  it('keeps no allowlist entry that no longer happens', () => {
    const actual = new Set(findViolations().map((violation) => violation.key));
    const stale = ALLOWLIST.filter((pair) => !actual.has(pairKey(pair))).map(describePair);
    expect(stale).toEqual([]);
  });

  it('holds each allowlist entry once', () => {
    expect(new Set(ALLOWLIST.map(pairKey)).size).toBe(ALLOWLIST.length);
  });
});
