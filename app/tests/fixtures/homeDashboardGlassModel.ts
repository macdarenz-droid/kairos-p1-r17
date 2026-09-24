import type { HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel } from '../../src/app/homeDashboardLiveCryptoBubbleReactRadiusScaleViewModel';
import type { HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult } from '../../src/application/dashboard/homeDashboardLiveCryptoBubbleAreaWeightProjection';
import type { DecimalString } from '../../src/domain/trades';

export function glassTestModel(count = 8): HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel {
  const symbols = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'LINK', 'SUI'];
  const presentation = Array.from({ length: count }, (_, i) => ({
    metricInput: { instrument: { venue: 'binance-spot', symbol: `${symbols[i] ?? `TEST${i}`}USDT` }, fact: {} as never, ageMs: 1000, freshness: 'fresh' as const, quoteVolume24h: String(100000 - i * 1000) as DecimalString, movementPercent24h: (i % 2 ? '-1.32' : '2.14') as DecimalString },
    availability: 'present' as const, movementSemantic: i % 2 ? 'negative' as const : 'positive' as const, freshnessState: 'fresh' as const,
  }));
  const area: Extract<HomeDashboardLiveCryptoBubbleAreaWeightProjectionResult, { ok: true }> = {
    ok: true, presentationStateProjection: { ok: true, metricObservation: {} as never, entries: presentation },
    entries: presentation.map(p => ({ presentationEntry: p, areaWeight: '1' as DecimalString })),
  };
  const runtimeState = { status: 'running' as const, latestObservation: null, lastError: null };
  return { runtimeState, areaWeightViewModel: { runtimeState, areaWeightProjection: area }, radiusScaleProjection: {
    ok: true, areaWeightProjection: area, entries: area.entries.map((entry, i) => ({ areaWeightEntry: entry, radiusScale: 1 / (1 + i * 0.42) })),
  } };
}
