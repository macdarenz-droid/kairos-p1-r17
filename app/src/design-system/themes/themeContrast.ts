import type { ThemeId } from './themeEngine';
import { themeRegistry } from './themeEngine';

type Rgba = Readonly<{ r: number; g: number; b: number; a: number }>;

/** Reads `#rrggbb`, `#rrggbbaa`, `rgb(...)` and `rgba(...)`; anything else is null. */
function parseColor(value: string): Rgba | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(text);
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: hex[2] === undefined ? 1 : Number.parseInt(hex[2], 16) / 255 };
  }
  const fn = /^rgba?\(\s*([^)]*)\)$/.exec(text);
  if (!fn) return null;
  const parts = fn[1]!.split(/\s*[,/]\s*|\s+/).filter(part => part !== '');
  if (parts.length !== 3 && parts.length !== 4) return null;
  const numbers = parts.map(part => (/^(\d+(\.\d*)?|\.\d+)%?$/.test(part) ? Number.parseFloat(part) / (part.endsWith('%') ? 100 : 1) : Number.NaN));
  if (numbers.some(Number.isNaN)) return null;
  const [r, g, b, a = 1] = numbers as [number, number, number, number?];
  const channel = (v: number, part: string) => (part.endsWith('%') ? v * 255 : v);
  const color = { r: channel(r, parts[0]!), g: channel(g, parts[1]!), b: channel(b, parts[2]!), a };
  return [color.r, color.g, color.b].every(v => v >= 0 && v <= 255) && a >= 0 && a <= 1 ? color : null;
}

/** A translucent colour laid over an opaque one. */
function over(top: Rgba, below: Rgba): Rgba {
  const mix = (t: number, b: number) => t * top.a + b * (1 - top.a);
  return { r: mix(top.r, below.r), g: mix(top.g, below.g), b: mix(top.b, below.b), a: 1 };
}

function luminance({ r, g, b }: Rgba): number {
  const linear = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function ratioOf(foreground: Rgba, background: Rgba): number {
  const a = luminance(over(foreground, background)), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** The WCAG 2.2 contrast ratio; a translucent foreground is laid over the background (taken as opaque) first. */
export function contrastRatio(foreground: string, background: string): number | null {
  const top = parseColor(foreground), below = parseColor(background);
  return top === null || below === null ? null : ratioOf(top, { ...below, a: 1 });
}

/** Text colours that must read at 4.5:1 or more on every surface. */
export const THEME_TEXT_ROLES = Object.freeze([
  '--kairos-text-primary', '--kairos-text-secondary', '--kairos-text-muted', '--kairos-accent-primary', '--kairos-accent-insight',
  '--kairos-trade-profit', '--kairos-trade-loss', '--kairos-trade-flat',
  '--kairos-state-success', '--kairos-state-warning', '--kairos-state-error', '--kairos-state-info',
] as const);

/** Every surface text and edges sit on; each is laid over `--kairos-background-base` first. */
export const THEME_SURFACES = Object.freeze([
  '--kairos-background-base', '--kairos-background-depth', '--kairos-surface-card', '--kairos-surface-raised', '--kairos-surface-modal', '--kairos-surface-input',
] as const);

/** Edges of things you act on, 3:1 or more on every surface (WCAG 1.4.11). */
export const THEME_EDGE_ROLES = Object.freeze(['--kairos-border-field', '--kairos-state-focus', '--kairos-border-active'] as const);

const TEXT_MINIMUM = 4.5, EDGE_MINIMUM = 3;
/** Button text on its fill: the primary button's gradient, and the buttons painted with the depth colour (T-049 N3). */
const BUTTON_PAIRS = Object.freeze([
  ['--kairos-accent-ink', '--kairos-accent-primary'], ['--kairos-accent-ink', '--kairos-accent-secondary'],
  ['--kairos-background-depth', '--kairos-accent-primary'], ['--kairos-background-depth', '--kairos-state-error'],
] as const);
const DEPTH_MINIMUMS = Object.freeze({ cardOnPage: 1.12, cardOnGlow: 1.1, raisedOnCard: 1.1, cardEdgeOnPage: 1.5 });

export type ThemeContrastFailure = Readonly<{ foreground: string; background: string; ratio: number; minimum: number }>;
export type ThemeDepth = Readonly<{ cardOnPage: number; cardOnGlow: number; raisedOnCard: number; cardEdgeOnPage: number }>;
export type TokenContrastResult = Readonly<{ failures: readonly ThemeContrastFailure[]; depth: ThemeDepth; passes: boolean }>;
export type ThemeContrastResult = Readonly<{ themeId: ThemeId } & TokenContrastResult>;

const round = (value: number) => Math.round(value * 100) / 100;

/** Every contrast and depth rule for one token map; a missing or unreadable token is a failure, never skipped. */
export function evaluateTokenContrast(tokens: Readonly<Record<string, string>>, options: Readonly<{ requireDepth: boolean }>): TokenContrastResult {
  const failures: ThemeContrastFailure[] = [];
  const color = (token: string): Rgba | null => (token in tokens ? parseColor(tokens[token]!) : null);
  const base = color('--kairos-background-base');
  const opaque = (token: string): Rgba | null => { const c = color(token); return c === null || base === null ? null : over(c, { ...base, a: 1 }); };
  const check = (foreground: string, fg: Rgba | null, background: string, bg: Rgba | null, minimum: number) => {
    const ratio = fg === null || bg === null ? 0 : ratioOf(fg, bg);
    if (ratio < minimum) failures.push(Object.freeze({ foreground, background, ratio: round(ratio), minimum }));
  };
  for (const surface of THEME_SURFACES) {
    const bg = opaque(surface);
    for (const text of THEME_TEXT_ROLES) check(text, color(text), surface, bg, TEXT_MINIMUM);
    for (const edge of THEME_EDGE_ROLES) check(edge, color(edge), surface, bg, EDGE_MINIMUM);
  }
  const fieldGradient = tokens['--kairos-field-gradient'];
  const stops = fieldGradient === undefined ? [] : fieldGradient.match(/#[0-9a-f]{6}\b/gi) ?? [];
  if (stops.length === 0) check('--kairos-border-field', color('--kairos-border-field'), '--kairos-field-gradient', null, EDGE_MINIMUM);
  for (const stop of stops) {
    const bg = parseColor(stop);
    check('--kairos-border-field', color('--kairos-border-field'), `--kairos-field-gradient ${stop.toLowerCase()}`, bg === null || base === null ? null : over(bg, { ...base, a: 1 }), EDGE_MINIMUM);
  }
  for (const [text, fill] of BUTTON_PAIRS) check(text, color(text), fill, opaque(fill), TEXT_MINIMUM);
  check('--kairos-chart-axis', color('--kairos-chart-axis'), '--kairos-chart-background', opaque('--kairos-chart-background'), TEXT_MINIMUM);

  const page = base === null ? null : { ...base, a: 1 };
  const card = opaque('--kairos-surface-card');
  const measure = (fg: Rgba | null, bg: Rgba | null) => (fg === null || bg === null ? 0 : ratioOf(fg, bg));
  const cardOnPage = measure(card, page);
  const glowText = tokens['--kairos-background-gradient'];
  const glowMatch = glowText === undefined ? null : /#[0-9a-f]{6}(?:[0-9a-f]{2})?\b|rgba?\([^)]*\)/i.exec(glowText);
  const glow = glowMatch === null ? null : parseColor(glowMatch[0]);
  let cardOnGlow = 0;
  if (glow !== null && page !== null && card !== null) {
    cardOnGlow = Number.POSITIVE_INFINITY;
    for (let step = Math.round(glow.a * 100); step >= 0; step -= 1) cardOnGlow = Math.min(cardOnGlow, ratioOf(card, over({ ...glow, a: step / 100 }, page)));
  }
  const raised = color('--kairos-surface-raised');
  const raisedOnCard = measure(raised === null || card === null ? null : over(raised, card), card);
  const hairline = color('--kairos-border-hairline');
  const cardEdgeOnPage = measure(hairline === null || card === null ? null : over(hairline, card), page);
  const depth: ThemeDepth = Object.freeze({ cardOnPage: round(cardOnPage), cardOnGlow: round(cardOnGlow), raisedOnCard: round(raisedOnCard), cardEdgeOnPage: round(cardEdgeOnPage) });
  if (options.requireDepth) {
    check('--kairos-surface-card', card, '--kairos-background-base', page, DEPTH_MINIMUMS.cardOnPage);
    if (cardOnGlow < DEPTH_MINIMUMS.cardOnGlow) failures.push(Object.freeze({ foreground: '--kairos-surface-card', background: '--kairos-background-gradient', ratio: round(cardOnGlow), minimum: DEPTH_MINIMUMS.cardOnGlow }));
    check('--kairos-surface-raised', raised === null || card === null ? null : over(raised, card), '--kairos-surface-card', card, DEPTH_MINIMUMS.raisedOnCard);
    check('--kairos-border-hairline', hairline === null || card === null ? null : over(hairline, card), '--kairos-background-base', page, DEPTH_MINIMUMS.cardEdgeOnPage);
  }
  return Object.freeze({ failures: Object.freeze(failures), depth, passes: failures.length === 0 });
}

/** Themes whose look is built on depth (D172); Ink and Paper keep their approved flat look, their depth is only reported. */
const DEPTH_THEMES: ReadonlySet<ThemeId> = new Set(['kairos-depth', 'cosmic', 'ocean']);

export function evaluateThemeContrast(themeId: ThemeId): ThemeContrastResult {
  return Object.freeze({ themeId, ...evaluateTokenContrast(themeRegistry[themeId].tokens, { requireDepth: DEPTH_THEMES.has(themeId) }) });
}
