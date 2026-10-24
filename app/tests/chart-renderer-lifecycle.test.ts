import { describe, expect, it, vi } from 'vitest';
import {
  defineChartRendererFactory,
  type ChartRendererLifecycle,
} from '../src/features/chart';

describe('P17.2 chart renderer lifecycle boundary', () => {
  it('keeps renderer lifecycle presentation-only', () => {
    const render = vi.fn();
    const destroy = vi.fn();
    const renderer: ChartRendererLifecycle = { render, destroy };

    const factory = defineChartRendererFactory({
      create: () => renderer,
    });

    const created = factory.create(document.createElement('div'));
    expect(created).toBe(renderer);

    created.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });
});
