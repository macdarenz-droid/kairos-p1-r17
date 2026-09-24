import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const defaultConfiguration = vi.hoisted(() => ({ marker: 'exact-gate362-default-configuration' }));
const defaultConfigurationFactoryMock = vi.hoisted(() => vi.fn(() => defaultConfiguration));
const configuredRadiusRuntimeMock = vi.hoisted(() => vi.fn((_props: unknown) => null));

vi.mock('../src/app/homeDashboardLiveCryptoBubbleRuntimeProductPolicy', () => ({
  createHomeDashboardLiveCryptoBubbleDefaultRuntimeProductConfiguration:
    defaultConfigurationFactoryMock,
}));

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime:
    configuredRadiusRuntimeMock,
}));

import { HomeRoute } from '../src/app/HomeRoute';

describe('Home Live Crypto Bubble HomeRoute normalized-radius textual-runtime integration amendment', () => {
  it('chooses the released default product configuration once and forwards that exact reference to the Gate372 runtime', () => {
    const markup = renderToStaticMarkup(<HomeRoute />);

    expect(defaultConfigurationFactoryMock).toHaveBeenCalledTimes(1);
    expect(configuredRadiusRuntimeMock).toHaveBeenCalledTimes(1);
    const props = configuredRadiusRuntimeMock.mock.calls[0]![0] as Record<'configuration', unknown>;
    expect(props.configuration).toBe(defaultConfiguration);
    expect(markup).toContain('data-kairos-home-dashboard="live-crypto-text-runtime"');
    expect(markup).toContain('Live Crypto Bubble');
    expect(markup).not.toContain('No dashboard insights are connected yet.');
  });
});
