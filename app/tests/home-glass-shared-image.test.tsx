import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { glassTestModel } from './fixtures/homeDashboardGlassModel';

import { stubGlassImage } from './fixtures/glassImageStub';

// T-061a (D273): every bubble shows one shared glass image, drawn once per page, not a 512×512 canvas each.
let glass: ReturnType<typeof stubGlassImage>;

async function loadMap() {
  vi.resetModules();
  return (await import('../src/app/HomeDashboardGlassBubbleMap')).HomeDashboardGlassBubbleMap;
}

beforeEach(() => {
  glass = stubGlassImage();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(366);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('one shared glass image', () => {
  it('12 bubbles draw the material once, hold no canvas and share one image', async () => {
    const HomeDashboardGlassBubbleMap = await loadMap();
    const { container, unmount } = render(<HomeDashboardGlassBubbleMap model={glassTestModel(12)} />);
    expect(container.querySelectorAll('.kairos-glass-bubble')).toHaveLength(12);
    await waitFor(() => expect(container.querySelectorAll('.kairos-glass-art[data-glass-ready="true"]')).toHaveLength(12));
    const art = [...container.querySelectorAll('.kairos-glass-art')];
    expect(art.every(element => element.tagName === 'IMG')).toBe(true);
    expect(new Set(art.map(element => element.getAttribute('src')))).toEqual(new Set(['blob:kairos-glass']));
    expect(art.every(element => element.getAttribute('alt') === '' && element.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(container.querySelectorAll('canvas')).toHaveLength(0);
    expect(glass.images).toBe(1);
    expect(glass.createObjectURL).toHaveBeenCalledTimes(1);

    // Another map on the same page uses the same image, at once.
    unmount();
    const again = render(<HomeDashboardGlassBubbleMap model={glassTestModel(12)} />);
    expect(again.container.querySelectorAll('.kairos-glass-art[data-glass-ready="true"]')).toHaveLength(12);
    expect(glass.images).toBe(1);
    expect(glass.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('a glass image that fails to load leaves the bubbles usable, and a later map tries again', async () => {
    glass.loads = false;
    const HomeDashboardGlassBubbleMap = await loadMap();
    const { container, unmount } = render(<HomeDashboardGlassBubbleMap model={glassTestModel(12)} />);
    await waitFor(() => expect(glass.images).toBe(1));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(container.querySelectorAll('.kairos-glass-bubble')).toHaveLength(12);
    expect(container.querySelectorAll('.kairos-glass-art')).toHaveLength(0);
    expect(container.querySelectorAll('canvas')).toHaveLength(0);
    expect(screen.getByText('BTC')).toBeVisible();
    expect(screen.getAllByText('+2.1%').length).toBeGreaterThan(0);
    expect(glass.createObjectURL).not.toHaveBeenCalled();

    unmount();
    glass.loads = true;
    const again = render(<HomeDashboardGlassBubbleMap model={glassTestModel(12)} />);
    await waitFor(() => expect(again.container.querySelectorAll('.kairos-glass-art[data-glass-ready="true"]')).toHaveLength(12));
    expect(glass.images).toBe(2);
  });

  it('an image address that cannot be made leaves the bubbles usable, and a later map tries again', async () => {
    glass.createObjectURL.mockImplementationOnce(() => { throw new Error('No object URLs here'); });
    const HomeDashboardGlassBubbleMap = await loadMap();
    const { container, unmount } = render(<HomeDashboardGlassBubbleMap model={glassTestModel(12)} />);
    await waitFor(() => expect(glass.createObjectURL).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(container.querySelectorAll('.kairos-glass-bubble')).toHaveLength(12);
    expect(container.querySelectorAll('.kairos-glass-art')).toHaveLength(0);

    unmount();
    const again = render(<HomeDashboardGlassBubbleMap model={glassTestModel(12)} />);
    await waitFor(() => expect(again.container.querySelectorAll('.kairos-glass-art[data-glass-ready="true"]')).toHaveLength(12));
    expect(glass.images).toBe(2);
  });
});
