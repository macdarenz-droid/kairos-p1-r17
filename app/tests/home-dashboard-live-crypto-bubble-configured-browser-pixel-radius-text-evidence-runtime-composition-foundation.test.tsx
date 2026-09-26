import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import type { HomeDashboardLiveCryptoBubblePixelRadiusPolicy } from '../src/application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusPolicy';
import type { HomeDashboardLiveCryptoBubblePixelRadiusProjectionResult } from '../src/application/dashboard/homeDashboardLiveCryptoBubblePixelRadiusProjection';
import type { HomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel } from '../src/app/homeDashboardLiveCryptoBubbleReactPixelRadiusViewModel';
import type { HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration } from '../src/app/homeDashboardLiveCryptoBubbleRuntimeOptionsComposition';

const pixelRadiusProjection = {
  marker: 'exact-configured-browser-pixel-radius-projection-reference',
} as unknown as HomeDashboardLiveCryptoBubblePixelRadiusProjectionResult;

const availableModel = {
  pixelRadiusProjection,
} as unknown as HomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel;

const unavailableModel = {
  pixelRadiusProjection: null,
} as unknown as HomeDashboardLiveCryptoBubbleReactPixelRadiusViewModel;

const configuredPixelRadiusHookMock = vi.hoisted(() => vi.fn());
const pixelRadiusTextEvidenceMock = vi.hoisted(() => vi.fn((_props: unknown) => null));

vi.mock('../src/app/useHomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusViewModel', () => ({
  useHomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusViewModel:
    configuredPixelRadiusHookMock,
}));

vi.mock('../src/app/HomeDashboardLiveCryptoBubblePixelRadiusTextEvidence', () => ({
  HomeDashboardLiveCryptoBubblePixelRadiusTextEvidence: pixelRadiusTextEvidenceMock,
}));

import { HomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusTextEvidenceRuntime } from '../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusTextEvidenceRuntime';

const configuration: HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration = {
  excludedStablecoinBaseAssets: new Set(['FIXTURE_STABLE_A', 'FIXTURE_STABLE_B']),
  neutralMaxAbsoluteMovementPercent: '0.125' as DecimalString,
};

const policy: HomeDashboardLiveCryptoBubblePixelRadiusPolicy = {
  minimumRadiusCssPixels: 16,
  maximumRadiusCssPixels: 48,
};

describe('Home Live Crypto Bubble configured browser pixel-radius text-evidence runtime composition foundation', () => {
  beforeEach(() => {
    configuredPixelRadiusHookMock.mockReset();
    pixelRadiusTextEvidenceMock.mockClear();
  });

  it('passes the exact caller configuration and policy once to the released hook and the exact available projection once to the released presenter', () => {
    configuredPixelRadiusHookMock.mockReturnValueOnce(availableModel);

    renderToStaticMarkup(
      <HomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusTextEvidenceRuntime
        configuration={configuration}
        policy={policy}
      />,
    );

    expect(configuredPixelRadiusHookMock).toHaveBeenCalledTimes(1);
    expect(configuredPixelRadiusHookMock).toHaveBeenCalledWith(configuration, policy);
    expect(pixelRadiusTextEvidenceMock).toHaveBeenCalledTimes(1);
    const props = pixelRadiusTextEvidenceMock.mock.calls[0]![0] as Record<'projection', unknown>;
    expect(props.projection).toBe(pixelRadiusProjection);
  });

  it('keeps a missing pixel-radius projection explicitly unavailable without invoking the projection presenter', () => {
    configuredPixelRadiusHookMock.mockReturnValueOnce(unavailableModel);

    const markup = renderToStaticMarkup(
      <HomeDashboardLiveCryptoBubbleConfiguredBrowserPixelRadiusTextEvidenceRuntime
        configuration={configuration}
        policy={policy}
      />,
    );

    expect(configuredPixelRadiusHookMock).toHaveBeenCalledTimes(1);
    expect(configuredPixelRadiusHookMock).toHaveBeenCalledWith(configuration, policy);
    expect(pixelRadiusTextEvidenceMock).not.toHaveBeenCalled();
    expect(markup).toContain('data-pixel-radius-projection-status="unavailable"');
    expect(markup).toContain('Pixel radius projection status: unavailable');
  });
});
