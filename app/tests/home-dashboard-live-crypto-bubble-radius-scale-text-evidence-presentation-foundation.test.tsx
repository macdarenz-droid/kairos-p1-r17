import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeDashboardLiveCryptoBubbleRadiusScaleTextEvidence } from '../src/app/HomeDashboardLiveCryptoBubbleRadiusScaleTextEvidence';
import type { HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel } from '../src/app/homeDashboardLiveCryptoBubbleReactRadiusScaleViewModel';
import type { HomeDashboardLiveCryptoBubbleReactRuntimeState } from '../src/app/useHomeDashboardLiveCryptoBubblePresentationObservedRuntime';
import type { HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult } from '../src/application/dashboard/homeDashboardLiveCryptoBubbleAreaWeightProjection';
import type { HomeDashboardLiveCryptoBubbleRadiusScaleProjectionResult } from '../src/application/dashboard/homeDashboardLiveCryptoBubbleRadiusScaleProjection';
import type { DecimalString } from '../src/domain/trades';

const d = (value: string) => value as DecimalString;

function runtimeState(
  status: HomeDashboardLiveCryptoBubbleReactRuntimeState['status'],
  lastError: unknown | null = null,
): HomeDashboardLiveCryptoBubbleReactRuntimeState {
  return { status, latestObservation: null, lastError };
}

function areaWeightProjection(): Extract<HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult, { ok: true }> {
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
  return {
    ok: true,
    presentationStateProjection,
    entries: [
      { presentationEntry: presentationStateProjection.entries[0], areaWeight: d('1') },
      { presentationEntry: presentationStateProjection.entries[1], areaWeight: null },
    ],
  };
}

function model(
  runtime: HomeDashboardLiveCryptoBubbleReactRuntimeState,
  projection: HomeDashboardLiveCryptoBubbleRadiusScaleProjectionResult | null,
): HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel {
  const areaWeightViewModel = {
    runtimeState: runtime,
    areaWeightProjection: projection?.areaWeightProjection ?? null,
  };
  return {
    areaWeightViewModel,
    runtimeState: runtime,
    radiusScaleProjection: projection,
  };
}

function successfulProjection(): Extract<HomeDashboardLiveCryptoBubbleRadiusScaleProjectionResult, { ok: true }> {
  const area = areaWeightProjection();
  return {
    ok: true,
    areaWeightProjection: area,
    entries: [
      { areaWeightEntry: area.entries[0], radiusScale: 1 },
      { areaWeightEntry: area.entries[1], radiusScale: null },
    ],
  };
}

describe('Home Live Crypto Bubble normalized radius-scale textual evidence presentation foundation', () => {
  it('exposes exact runtime state without fabricating radius evidence before one exists', () => {
    const html = renderToStaticMarkup(
      <HomeDashboardLiveCryptoBubbleRadiusScaleTextEvidence model={model(runtimeState('starting'), null)} />,
    );

    expect(html).toContain('data-runtime-status="starting"');
    expect(html).toContain('data-runtime-error="none"');
    expect(html).toContain('data-radius-projection-status="none"');
    expect(html).toContain('No radius-scale observation');
  });

  it('renders released normalized radius evidence in exact entry order without recomputing it', () => {
    const html = renderToStaticMarkup(
      <HomeDashboardLiveCryptoBubbleRadiusScaleTextEvidence
        model={model(runtimeState('running'), successfulProjection())}
      />,
    );

    expect(html).toContain('data-radius-projection-status="available"');
    expect(html.indexOf('BTCUSDT')).toBeLessThan(html.indexOf('ETHUSDT'));
    expect(html).toContain('binance-spot');
    expect(html).toContain('<dd>1</dd>');
    expect(html).toContain('<dd>missing</dd>');
  });

  it('keeps later runtime failure evidence separate while retaining released radius evidence', () => {
    const html = renderToStaticMarkup(
      <HomeDashboardLiveCryptoBubbleRadiusScaleTextEvidence
        model={model(runtimeState('acquisition-failed', new Error('network')), successfulProjection())}
      />,
    );

    expect(html).toContain('data-runtime-status="acquisition-failed"');
    expect(html).toContain('data-runtime-error="present"');
    expect(html).toContain('data-radius-projection-status="available"');
    expect(html).toContain('BTCUSDT');
  });

  it('renders exact released radius projection failure evidence without inventing fallback geometry', () => {
    const area = areaWeightProjection();
    const projection: HomeDashboardLiveCryptoBubbleRadiusScaleProjectionResult = {
      ok: false,
      reason: 'radius-scale-entry-invalid',
      areaWeightProjection: area,
      entryIndex: 1,
    };
    const html = renderToStaticMarkup(
      <HomeDashboardLiveCryptoBubbleRadiusScaleTextEvidence model={model(runtimeState('running'), projection)} />,
    );

    expect(html).toContain('data-radius-projection-status="failed"');
    expect(html).toContain('Radius projection status: radius-scale-entry-invalid');
    expect(html).toContain('Entry index: 1');
    expect(html).not.toContain('BTCUSDT');
  });
});
