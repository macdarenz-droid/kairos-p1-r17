import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import type { HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel } from '../src/app/homeDashboardLiveCryptoBubbleReactRadiusScaleViewModel';
import type { HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration } from '../src/app/homeDashboardLiveCryptoBubbleRuntimeOptionsComposition';

const radiusScaleModel = {
  marker: 'exact-configured-browser-radius-scale-model-reference',
} as unknown as HomeDashboardLiveCryptoBubbleReactRadiusScaleViewModel;

const configuredRadiusHookMock = vi.hoisted(() => vi.fn((_configuration: unknown) => radiusScaleModel));
const radiusTextEvidenceMock = vi.hoisted(() => vi.fn((_props: unknown) => null));

vi.mock('../src/app/useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel', () => ({
  useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel: configuredRadiusHookMock,
}));

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleRadiusScaleTextEvidence', () => ({
  HomeDashboardLiveCryptoBubbleRadiusScaleTextEvidence: radiusTextEvidenceMock,
}));

import { HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime } from '../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime';

describe('Home Live Crypto Bubble configured browser radius-scale text-evidence runtime composition foundation', () => {
  it('passes the exact caller configuration once to the released hook and the exact returned model once to the released presenter', () => {
    const configuration: HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration = {
      excludedStablecoinBaseAssets: new Set(['FIXTURE_STABLE_A', 'FIXTURE_STABLE_B']),
      neutralMaxAbsoluteMovementPercent: '0.125' as DecimalString,
    };

    renderToStaticMarkup(
      <HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime configuration={configuration} />,
    );

    expect(configuredRadiusHookMock).toHaveBeenCalledTimes(1);
    expect(configuredRadiusHookMock).toHaveBeenCalledWith(configuration);
    expect(radiusTextEvidenceMock).toHaveBeenCalledTimes(1);
    const props = radiusTextEvidenceMock.mock.calls[0]![0] as Record<'model', unknown>;
    expect(props.model).toBe(radiusScaleModel);
  });
});
