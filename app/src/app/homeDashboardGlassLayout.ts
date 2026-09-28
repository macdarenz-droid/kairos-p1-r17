import { validateHomeDashboardLiveCryptoBubbleLayoutBoundsPolicy } from '../application/dashboard/homeDashboardLiveCryptoBubbleLayoutBoundsPolicy';

export interface GlassCircleInput { readonly key: string; readonly radius: number }
export interface GlassCircle extends GlassCircleInput { readonly x: number; readonly y: number }

/** Stable irregular packing in measured CSS pixels. Radii arrive from the
 * released pixel-radius projection. Gap includes the entire hover envelope.
 * Never shrink a supplied radius to fit; grow scroll height instead.
 */
export function layoutGlassCircles(inputs: readonly GlassCircleInput[], width: number): { circles: GlassCircle[]; height: number } {
  if (!validateHomeDashboardLiveCryptoBubbleLayoutBoundsPolicy({ widthCssPixels: width, heightCssPixels: 0 }).ok || width === 0) {
    return { circles: [], height: 0 };
  }
  if (inputs.some(x => !Number.isFinite(x.radius) || x.radius <= 0 || x.radius * 2 + 24 > width)) {
    return { circles: [], height: 0 };
  }
  let seed = 7519;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const circles: GlassCircle[] = [];
  let bottom = 0;
  for (const item of inputs) {
    const extent = item.radius + 12;
    let best: GlassCircle | null = null;
    let bestScore = Infinity;
    let height = Math.max(width, bottom + extent * 2);
    for (let pass = 0; pass < 4 && best === null; pass++) {
      for (let attempt = 0; attempt < 600; attempt++) {
        const x = extent + random() * (width - extent * 2);
        const y = extent + random() * (height - extent * 2);
        if (circles.some(c => Math.hypot(x - c.x, y - c.y) < item.radius + c.radius + 24)) continue;
        const score = y + random() * width * 0.25;
        if (score < bestScore) { best = { ...item, x, y }; bestScore = score; }
      }
      height += width / 2;
    }
    const circle = best ?? { ...item, x: width / 2, y: bottom + extent };
    circles.push(circle);
    bottom = Math.max(bottom, circle.y + extent);
  }
  return { circles, height: bottom };
}
