import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomeDashboardLiveCryptoBubbleTextEvidenceRuntime } from '../src/app/HomeDashboardLiveCryptoBubbleTextEvidenceRuntime';
import type { HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel } from '../src/app/homeDashboardLiveCryptoBubbleReactAreaWeightViewModel';
import type { HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions } from '../src/app/useHomeDashboardLiveCryptoBubblePresentationObservedRuntime';

const hookMock = vi.hoisted(() => vi.fn());

vi.mock('../src/app/useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel', () => ({
  useHomeDashboardLiveCryptoBubbleReactAreaWeightViewModel: hookMock,
}));

describe('Home Live Crypto Bubble textual-evidence runtime composition foundation', () => {
  it('delegates the exact caller-owned runtime inputs once and renders the exact returned model', () => {
    const readObservedAt = () => '2026-09-10T13:55:00.000Z';
    const readEvaluationTimeMs = () => 1_789_050_900_000;
    const options = { marker: 'exact-options-reference' } as unknown as HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions;
    const returnedModel = {
      runtimeState: {
        status: 'starting',
        latestObservation: null,
        lastError: null,
      },
      areaWeightProjection: null,
    } as HomeDashboardLiveCryptoBubbleReactAreaWeightViewModel;
    hookMock.mockReturnValue(returnedModel);

    const html = renderToStaticMarkup(
      <HomeDashboardLiveCryptoBubbleTextEvidenceRuntime
        readObservedAt={readObservedAt}
        readEvaluationTimeMs={readEvaluationTimeMs}
        options={options}
      />,
    );

    expect(hookMock).toHaveBeenCalledTimes(1);
    const [observedAtArg, evaluationArg, optionsArg] = hookMock.mock.calls[0];
    expect(observedAtArg).toBe(readObservedAt);
    expect(evaluationArg).toBe(readEvaluationTimeMs);
    expect(optionsArg).toBe(options);
    expect(html).toContain('aria-label="Live Crypto Bubble market evidence"');
    expect(html).toContain('data-runtime-status="starting"');
    expect(html).toContain('data-projection-status="none"');
    expect(html).toContain('No market observation');
  });
});
