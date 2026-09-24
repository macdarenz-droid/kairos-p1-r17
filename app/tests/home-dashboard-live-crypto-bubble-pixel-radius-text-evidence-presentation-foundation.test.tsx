import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeDashboardLiveCryptoBubblePixelRadiusTextEvidence } from '../src/app/HomeDashboardLiveCryptoBubblePixelRadiusTextEvidence';
import type {
  HomeDashboardLiveCryptoBubblePixelRadiusProjectionResult,
} from '../src/application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusProjection';
import type {
  HomeDashboardLiveCryptoBubblePixelRadiusPolicy,
} from '../src/application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusPolicy';
import type { DecimalString } from '../src/domain/trades';

const d = (value: string) => value as DecimalString;

const policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy = {
  minimumRadiusCssPixels: 10,
  maximumRadiusCssPixels: 50,
};

function successfulProjection(): Extract<HomeDashboardLiveCryptoBubblePixelRadiusProjectionResult, { ok: true }> {
  const firstMetric = {
    instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' },
    fact: {} as never,
    ageMs: 5000,
    freshness: 'fresh' as const,
    quoteVolume24h: d('1250000.5'),
    movementPercent24h: d('2.75'),
  };
  const secondMetric = {
    instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' },
    fact: null,
    ageMs: null,
    freshness: null,
    quoteVolume24h: null,
    movementPercent24h: null,
  };
  const presentationStateProjection = {
    ok: true as const,
    metricObservation: {} as never,
    entries: [
      { metricInput: firstMetric, availability: 'present' as const, movementSemantic: 'positive' as const, freshnessState: 'fresh' as const },
      { metricInput: secondMetric, availability: 'missing' as const, movementSemantic: null, freshnessState: 'missing' as const },
    ],
  };
  const areaWeightProjection = {
    ok: true as const,
    presentationStateProjection,
    entries: [
      { presentationEntry: presentationStateProjection.entries[0], areaWeight: d('1') },
      { presentationEntry: presentationStateProjection.entries[1], areaWeight: null },
    ],
  };
  const radiusScaleProjection = {
    ok: true as const,
    areaWeightProjection,
    entries: [
      { areaWeightEntry: areaWeightProjection.entries[0], radiusScale: 1 },
      { areaWeightEntry: areaWeightProjection.entries[1], radiusScale: null },
    ],
  };
  return {
    ok: true,
    radiusScaleProjection,
    policy,
    entries: [
      { radiusScaleEntry: radiusScaleProjection.entries[0], radiusCssPixels: 50 },
      { radiusScaleEntry: radiusScaleProjection.entries[1], radiusCssPixels: null },
    ],
  };
}

describe('Home Live Crypto Bubble pixel-radius textual evidence presentation foundation', () => {
  it('renders released CSS-pixel radius evidence in exact entry order without recomputing it', () => {
    const projection = successfulProjection();
    const html = renderToStaticMarkup(
      <HomeDashboardLiveCryptoBubblePixelRadiusTextEvidence projection={projection} />,
    );

    expect(html).toContain('data-pixel-radius-projection-status="available"');
    expect(html.indexOf('BTCUSDT')).toBeLessThan(html.indexOf('ETHUSDT'));
    expect(html).toContain('binance-spot');
    expect(html).toContain('<dd>50</dd>');
    expect(html).toContain('<dd>missing</dd>');
  });

  it('renders exact released projection failure evidence without inventing fallback pixel geometry', () => {
    const radiusScaleFailure = {
      ok: false as const,
      reason: 'radius-scale-entry-invalid' as const,
      areaWeightProjection: { ok: true } as never,
      entryIndex: 1,
    };
    const projection: HomeDashboardLiveCryptoBubblePixelRadiusProjectionResult = {
      ok: false,
      reason: 'radius-scale-projection-invalid',
      radiusScaleProjection: radiusScaleFailure,
      policy,
    };
    const html = renderToStaticMarkup(
      <HomeDashboardLiveCryptoBubblePixelRadiusTextEvidence projection={projection} />,
    );

    expect(html).toContain('data-pixel-radius-projection-status="failed"');
    expect(html).toContain('Pixel radius projection status: radius-scale-projection-invalid');
    expect(html).toContain('Radius-scale projection status: radius-scale-entry-invalid');
    expect(html).not.toContain('BTCUSDT');
  });

  it('renders released policy-validation failure evidence without choosing substitute bounds', () => {
    const successful = successfulProjection();
    const projection: HomeDashboardLiveCryptoBubblePixelRadiusProjectionResult = {
      ok: false,
      reason: 'pixel-radius-policy-invalid',
      radiusScaleProjection: successful.radiusScaleProjection,
      policy: { minimumRadiusCssPixels: 50, maximumRadiusCssPixels: 10 },
      policyValidation: { ok: false, reason: 'radius-range-invalid' },
    };
    const html = renderToStaticMarkup(
      <HomeDashboardLiveCryptoBubblePixelRadiusTextEvidence projection={projection} />,
    );

    expect(html).toContain('Pixel radius projection status: pixel-radius-policy-invalid');
    expect(html).toContain('Policy validation: radius-range-invalid');
    expect(html).not.toContain('<dd>10</dd>');
    expect(html).not.toContain('<dd>50</dd>');
  });

  it('preserves exact failed entry index evidence from Gate375', () => {
    const successful = successfulProjection();
    const projection: HomeDashboardLiveCryptoBubblePixelRadiusProjectionResult = {
      ok: false,
      reason: 'pixel-radius-entry-invalid',
      radiusScaleProjection: successful.radiusScaleProjection,
      policy,
      entryIndex: 1,
    };
    const html = renderToStaticMarkup(
      <HomeDashboardLiveCryptoBubblePixelRadiusTextEvidence projection={projection} />,
    );

    expect(html).toContain('Pixel radius projection status: pixel-radius-entry-invalid');
    expect(html).toContain('Entry index: 1');
  });
});
