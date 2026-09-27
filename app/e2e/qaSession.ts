import { expect, type Locator, type Page } from '@playwright/test';
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ACTIVATION_URL = 'https://activation.qa.invalid/v1/activate';
const THEME_KEY = 'kairos.theme.preference.v1';

/**
 * Opens the QA build signed in: the theme choice (if given) is stored before the app starts, the activation request
 * gets a fixed signed receipt, and every other https request is aborted (no network in design checks).
 */
export async function openKairos(page: Page, options: Readonly<{ theme?: string }> = {}): Promise<void> {
  if (options.theme !== undefined) {
    await page.addInitScript(([key, theme]) => { window.localStorage.setItem(key!, theme!); }, [THEME_KEY, options.theme]);
  }
  const key = createPrivateKey(readFileSync('e2e/.qa/qa-key.pem'));
  const activationId = 'qa-design', issuedAt = '2026-09-20T00:00:00.000Z';
  const verifierPayload = JSON.stringify({ proofVersion: 1, purpose: 'kairos-activation', receiptVersion: 1, activationId, issuedAt });
  const verifierSignature = sign('sha256', Buffer.from(verifierPayload), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  await page.route(url => url.protocol === 'https:', async route => {
    if (route.request().url() !== ACTIVATION_URL) return route.abort();
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, receipt: { receiptVersion: 1, activationId, issuedAt, verifierPayload, verifierSignature } }),
    });
  });
  await page.goto('/');
  await page.getByLabel('Invite code').fill('QA-INVITE-001');
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('.kairos-shell')).toBeVisible();
}

export type EdgeContrast = Readonly<{ againstFill: number; againstOutside: number }>;

/**
 * The element's top edge colour against its own fill (the nearest painted ancestor's when the fill is transparent)
 * and against what is around it (the nearest painted ancestor). Translucent layers are laid over the ones below,
 * down to the page colour; the ratio is the WCAG one used by `contrastRatio`.
 */
export async function contrastInPage(page: Page, locator: Locator): Promise<EdgeContrast> {
  void page;
  return locator.evaluate(element => {
    type Rgba = { r: number; g: number; b: number; a: number };
    const parse = (value: string): Rgba | null => {
      const match = /rgba?\(([^)]*)\)/.exec(value);
      if (!match) return null;
      const [r, g, b, a = 1] = match[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r: r!, g: g!, b: b!, a };
    };
    const over = (top: Rgba, below: Rgba): Rgba => ({ r: top.r * top.a + below.r * (1 - top.a), g: top.g * top.a + below.g * (1 - top.a), b: top.b * top.a + below.b * (1 - top.a), a: 1 });
    const luminance = ({ r, g, b }: Rgba) => {
      const linear = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    };
    const ratio = (fg: Rgba, bg: Rgba) => { const a = luminance(over(fg, bg)), b = luminance(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
    const pageColour = (): Rgba => {
      const probe = document.createElement('div');
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--kairos-background-base').trim();
      document.body.append(probe);
      const colour = parse(getComputedStyle(probe).color) ?? { r: 0, g: 0, b: 0, a: 1 };
      probe.remove();
      return { ...colour, a: 1 };
    };
    /** The colour painted behind `start` (itself included), laying translucent layers over the ones below. */
    const paintedFrom = (start: Element | null): Rgba => {
      const layers: Rgba[] = [];
      for (let node = start; node !== null; node = node.parentElement) {
        const colour = parse(getComputedStyle(node).backgroundColor);
        if (colour === null || colour.a === 0) continue;
        layers.push(colour);
        if (colour.a === 1) break;
      }
      let result = layers.length > 0 && layers[layers.length - 1]!.a === 1 ? layers.pop()! : pageColour();
      for (const layer of layers.reverse()) result = over(layer, result);
      return result;
    };
    const edge = parse(getComputedStyle(element).borderTopColor)!;
    return { againstFill: ratio(edge, paintedFrom(element)), againstOutside: ratio(edge, paintedFrom(element.parentElement)) };
  });
}
