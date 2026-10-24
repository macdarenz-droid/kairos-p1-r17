import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import type { HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions } from '../src/app/useHomeDashboardLiveCryptoBubblePresentationObservedRuntime';
import type { HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration } from '../src/app/homeDashboardLiveCryptoBubbleRuntimeOptionsComposition';

const composedOptions = {
  marker: 'exact-composed-runtime-options-reference',
} as unknown as HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions;

const composeRuntimeOptionsMock = vi.hoisted(() => vi.fn((_configuration: unknown) => composedOptions));
const browserRuntimeMock = vi.hoisted(() => vi.fn((_props: unknown) => null));

vi.mock('../src/app/homeDashboardLiveCryptoBubbleRuntimeOptionsComposition', () => ({
  composeHomeDashboardLiveCryptoBubbleRuntimeBindingOptions: composeRuntimeOptionsMock,
}));

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleBrowserTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleBrowserTextEvidenceRuntime: browserRuntimeMock,
}));

import { HomeDashboardLiveCryptoBubbleConfiguredTextEvidenceRuntime } from '../src/app/HomeDashboardLiveCryptoBubbleConfiguredTextEvidenceRuntime';

describe('Home Live Crypto Bubble configured textual-evidence runtime composition foundation', () => {
  it('composes the exact caller configuration once and forwards only the composed options', () => {
    const configuration: HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration = {
      excludedStablecoinBaseAssets: new Set(['FIXTURE_STABLE_A', 'FIXTURE_STABLE_B']),
      neutralMaxAbsoluteMovementPercent: '0.125' as DecimalString,
    };

    renderToStaticMarkup(
      <HomeDashboardLiveCryptoBubbleConfiguredTextEvidenceRuntime configuration={configuration} />,
    );

    expect(composeRuntimeOptionsMock).toHaveBeenCalledTimes(1);
    expect(composeRuntimeOptionsMock).toHaveBeenCalledWith(configuration);
    expect(browserRuntimeMock).toHaveBeenCalledTimes(1);
    const props = browserRuntimeMock.mock.calls[0]![0] as Record<'options', unknown>;
    expect(props.options).toBe(composedOptions);
  });
});
