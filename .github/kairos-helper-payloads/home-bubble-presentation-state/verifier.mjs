import { readFileSync } from 'node:fs';

const source = readFileSync('src/application/dashboard/homeDashboardLiveCryptoBubblePresentationStateProjection.ts', 'utf8');
const test = readFileSync('tests/home-dashboard-live-crypto-bubble-presentation-state-projection-foundation.test.ts', 'utf8');
const report = readFileSync('KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_PRESENTATION_STATE_PROJECTION_FOUNDATION_REPORT_2026-09-10.md', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

for (const token of [
  'projectHomeDashboardLiveCryptoBubblePresentationState',
  "neutralMaxAbsoluteMovementPercent: DecimalString",
  "HomeDashboardLiveCryptoBubbleMetricAvailability = 'present' | 'missing'",
  "HomeDashboardLiveCryptoBubbleMovementSemantic = 'positive' | 'negative' | 'neutral'",
  "'missing'",
  'HomeDashboardLiveCryptoBubbleFreshnessPresentationState',
  "freshnessState: metricInput.freshness",
  'parseDecimalString(String(policy.neutralMaxAbsoluteMovementPercent))',
  'decimalAbs(movementPercent24h)',
  'decimalSubtract(',
  "reason: 'bubble-metric-projection-invalid'",
  "reason: 'neutral-threshold-invalid'",
  "reason: 'metric-entry-inconsistent'",
]) {
  if (!source.includes(token)) throw new Error(`Bubble presentation-state projection evidence missing: ${token}`);
}

for (const forbidden of [
  'Date.now(', 'new Date(', 'setTimeout(', 'setInterval(', 'fetch(', 'XMLHttpRequest', 'WebSocket(',
  "from 'react'", 'useEffect', 'useState', 'indexedDB', 'AbortController', '.sort(', '.filter(', '.reduce(',
  '15_000', '60_000', 'freshMaxAgeMs', 'staleMaxAgeMs', 'priceChangePercent',
  'borderRadius', 'width:', 'height:', 'left:', 'top:', 'transform:', 'className=', '<div', '<svg',
  'startBinanceHomeDashboardLiveCryptoBubbleObservedRuntime(',
]) {
  if (source.includes(forbidden)) throw new Error(`Bubble presentation-state projection broadened ownership: ${forbidden}`);
}

for (const token of [
  'preserves exact metric inputs and classifies positive, negative, near-zero, freshness, and missing semantics without styling',
  'treats both signs at the exact caller-owned neutral boundary as neutral and does not invent a default threshold',
  'fails closed on a negative or malformed caller-owned neutral threshold',
  'preserves an upstream Bubble metric projection failure as explicit non-presentation failure data',
  'keeps expired explicitly non-current and fails closed on inconsistent released metric-entry shape',
]) {
  if (!test.includes(token)) throw new Error(`Missing Bubble presentation-state regression: ${token}`);
}

for (const token of [
  'provider-neutral semantic presentation-state projection below React',
  'Near-zero is not guessed or hard-coded',
  'inclusive absolute boundary as neutral',
  'Expired remains explicitly `expired`',
  'No CSS/design-token values or palette choice',
]) {
  if (!report.includes(token)) throw new Error(`Bubble presentation-state report evidence missing: ${token}`);
}

const verifyName = 'verify:home-dashboard-live-crypto-bubble-presentation-state-projection-foundation';
if (pkg.scripts?.[verifyName] !== 'node scripts/verify-home-dashboard-live-crypto-bubble-presentation-state-projection-foundation.mjs') {
  throw new Error('Bubble presentation-state projection verifier registration mismatch');
}

console.log('PASS: Home Live Crypto Bubble semantic presentation-state projection remains provider-neutral, policy-injected, and below React/style/geometry.');
