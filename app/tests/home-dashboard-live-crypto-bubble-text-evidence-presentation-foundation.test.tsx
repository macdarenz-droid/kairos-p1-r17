import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeDashboardLiveCryptoBubbleTextEvidence } from '../src/app/HomeDashboardLiveCryptoBubbleTextEvidence';
import type { HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel } from '../src/app/homeDashboardLiveCryptoBubbleReactAreaWeightViewModel';
import type { HomeDashboardLiveCryptoBubbleReactRuntimeState } from '../src/app/useHomeDashboardLiveCryptoBubblePresentationObservedRuntime';
import type { DecimalString } from '../src/domain/trades';
import type { HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult } from '../src/application/dashboard/homeDashboardLiveCryptoBubbleAreaWeightProjection';

const d = (value: string) => value as DecimalString;

function runtimeState(
  status: HomeDashboardLiveCryptoBubbleReactRuntimeState['status'],
  lastError: unknown | null = null,
): HomeDashboardLiveCryptoBubbleReactRuntimeState {
  return { status, latestObservation: null, lastError };
}

function model(
  runtime: HomeDashboardLiveCryptoBubbleReactRuntimeState,
  projection: HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult | null,
): HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel {
  return { runtimeState: runtime, areaWeightProjection: projection };
}

function successfulProjection(): Extract<HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult, { ok: true }> {
  const presentMetric = {
    instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' },
    fact: {} as never,
    ageMs: 5000,
    freshness: 'fresh' as const,
    quoteVolume24h: d('1250000.5'),
    movementPercent24h: d('2.75'),
  };
  const missingMetric = {
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
      { metricInput: presentMetric, availability: 'present' as const, movementSemantic: 'positive' as const, freshnessState: 'fresh' as const },
      { metricInput: missingMetric, availability: 'missing' as const, movementSemantic: null, freshnessState: 'missing' as const },
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

describe('Home Live Crypto Bubble textual evidence presentation foundation', () => {
  it('exposes exact runtime state without fabricating an observation before one exists', () => {
    const html = renderToStaticMarkup(
      <HomeDashboardLiveCryptoBubbleTextEvidence model={model(runtimeState('starting'), null)} />,
    );

    expect(html).toContain('data-runtime-status="starting"');
    expect(html).toContain('data-runtime-error="none"');
    expect(html).toContain('<dd>starting</dd>');
    expect(html).toContain('data-projection-status="none"');
    expect(html).toContain('No market observation');
  });

  it('renders released market evidence in exact entry order without recomputing metric truth', () => {
    const html = renderToStaticMarkup(
      <HomeDashboardLiveCryptoBubbleTextEvidence model={model(runtimeState('running'), successfulProjection())} />,
    );

    expect(html).toContain('data-projection-status="available"');
    expect(html.indexOf('BTCUSDT')).toBeLessThan(html.indexOf('ETHUSDT'));
    expect(html).toContain('1250000.5');
    expect(html).toContain('2.75');
    expect(html).toContain('<dd>positive</dd>');
    expect(html).toContain('<dd>fresh</dd>');
    expect(html).toContain('<dd>1</dd>');
    expect(html).toContain('<dd>missing</dd>');
  });

  it('keeps later runtime failure evidence separate while retaining an available projection', () => {
    const html = renderToStaticMarkup(
      <HomeDashboardLiveCryptoBubbleTextEvidence
        model={model(runtimeState('acquisition-failed', new Error('network')), successfulProjection())}
      />,
    );

    expect(html).toContain('data-runtime-status="acquisition-failed"');
    expect(html).toContain('data-runtime-error="present"');
    expect(html).toContain('data-projection-status="available"');
    expect(html).toContain('BTCUSDT');
  });

  it('renders exact released projection failure reason and entry index without inventing fallback metrics', () => {
    const projection: HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult = {
      ok: false,
      reason: 'area-weight-entry-inconsistent',
      presentationStateProjection: { ok: true, metricObservation: {} as never, entries: [] },
      entryIndex: 3,
    };
    const html = renderToStaticMarkup(
      <HomeDashboardLiveCryptoBubbleTextEvidence model={model(runtimeState('running'), projection)} />,
    );

    expect(html).toContain('data-projection-status="failed"');
    expect(html).toContain('Projection status: area-weight-entry-inconsistent');
    expect(html).toContain('Entry index: 3');
    expect(html).not.toContain('BTCUSDT');
  });
});
