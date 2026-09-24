import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomeDashboardLiveCryptoBubbleBrowserTextEvidenceRuntime } from '../src/app/HomeDashboardLiveCryptoBubbleBrowserTextEvidenceRuntime';
import {
  readHomeDashboardLiveCryptoBubbleBrowserEvaluationTimeMs,
  readHomeDashboardLiveCryptoBubbleBrowserObservedAt,
} from '../src/app/homeDashboardLiveCryptoBubbleBrowserWallClock';
import type { HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions } from '../src/app/useHomeDashboardLiveCryptoBubblePresentationObservedRuntime';

const runtimeMock = vi.hoisted(() => vi.fn((_props: unknown) => null));

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleTextEvidenceRuntime: runtimeMock,
}));

describe('Home Live Crypto Bubble browser-clock textual-evidence runtime composition foundation', () => {
  it('injects the exact released browser clocks once and forwards the exact caller options', () => {
    const options = { marker: 'exact-runtime-options-reference' } as unknown as HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions;

    renderToStaticMarkup(
      <HomeDashboardLiveCryptoBubbleBrowserTextEvidenceRuntime options={options} />,
    );

    expect(runtimeMock).toHaveBeenCalledTimes(1);
    const props = runtimeMock.mock.calls[0]![0] as Record<'readObservedAt' | 'readEvaluationTimeMs' | 'options', unknown>;
    expect(props.readObservedAt).toBe(readHomeDashboardLiveCryptoBubbleBrowserObservedAt);
    expect(props.readEvaluationTimeMs).toBe(readHomeDashboardLiveCryptoBubbleBrowserEvaluationTimeMs);
    expect(props.options).toBe(options);
  });
});
