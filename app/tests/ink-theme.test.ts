import { describe, expect, it } from 'vitest';
import { defaultThemeId, themeIds, themeRegistry } from '../src/design-system/themes';
import { geometryTokens, semanticTokens } from '../src/design-system/tokens';

const ink = themeRegistry.ink.tokens;
const paper = themeRegistry.paper.tokens;

describe('Ink theme registry amendment', () => {
  it('makes Ink the default and keeps every earlier theme registered', () => {
    expect(defaultThemeId).toBe('ink');
    expect(themeIds).toEqual(['ink', 'paper', 'kairos-depth', 'cosmic', 'ocean']);
    expect(themeRegistry.ink.colorScheme).toBe('dark');
    expect(themeRegistry.paper.colorScheme).toBe('light');
    for (const legacy of ['kairos-depth', 'cosmic', 'ocean'] as const) expect(themeRegistry[legacy].colorScheme).toBe('dark');
  });

  it('carries the approved Ink surface ladder, hairlines, single accent and semantic chroma exactly', () => {
    expect(ink['--kairos-background-base']).toBe('#08090b');
    expect(ink['--kairos-surface-card']).toBe('#0d0f13');
    expect(ink['--kairos-surface-raised']).toBe('#13161c');
    expect(ink['--kairos-border-hairline']).toBe('rgba(255,255,255,.08)');
    expect(ink['--kairos-border-strong']).toBe('rgba(255,255,255,.14)');
    expect(ink['--kairos-border-subtle']).toBe(ink['--kairos-border-hairline']);
    expect(ink['--kairos-border-default']).toBe(ink['--kairos-border-strong']);
    expect(ink['--kairos-text-primary']).toBe('#f3f4f6');
    expect(ink['--kairos-text-secondary']).toBe('#a1a7b3');
    expect(ink['--kairos-text-muted']).toBe('#6b7280');
    expect(ink['--kairos-accent-primary']).toBe('#7d86ff');
    expect(ink['--kairos-trade-profit']).toBe('#3ecf8e');
    expect(ink['--kairos-trade-loss']).toBe('#f0616d');
    expect(ink['--kairos-trade-flat']).toBe('#8a919e');
    expect(ink['--kairos-bubble-identity-btc']).toBe('#f5b544');
    expect(ink['--kairos-bubble-identity-eth']).toBe('#9db7ff');
  });

  it('removes glow and decorative smoke from Ink and Paper', () => {
    for (const tokens of [ink, paper]) {
      for (const glow of ['--kairos-glow-none', '--kairos-glow-subtle', '--kairos-glow-active', '--kairos-glow-emphasis']) expect(tokens[glow]).toBe('none');
      for (const smoke of ['--kairos-bubble-smoke-1', '--kairos-bubble-smoke-2', '--kairos-bubble-smoke-3', '--kairos-bubble-smoke-4']) expect(tokens[smoke]).toBe('transparent');
    }
  });

  it('gives every active theme the gradient, hairline and accent-ink roles', () => {
    for (const themeId of themeIds) {
      const tokens = themeRegistry[themeId].tokens;
      for (const role of ['--kairos-background-gradient', '--kairos-surface-gradient', '--kairos-field-gradient', '--kairos-border-hairline', '--kairos-border-strong', '--kairos-accent-ink']) {
        expect(tokens[role], `${themeId} ${role}`).toBeTruthy();
      }
      expect(tokens['--kairos-background-gradient']).toContain('gradient(');
    }
    expect(semanticTokens.background.gradient).toBe('var(--kairos-background-gradient)');
    expect(semanticTokens.surface.gradient).toBe('var(--kairos-surface-gradient)');
    expect(semanticTokens.surface.field).toBe('var(--kairos-field-gradient)');
    expect(semanticTokens.border.hairline).toBe('var(--kairos-border-hairline)');
    expect(semanticTokens.border.strong).toBe('var(--kairos-border-strong)');
    expect(semanticTokens.accent.ink).toBe('var(--kairos-accent-ink)');
  });

  it('keeps Paper a real light theme with the same token shape', () => {
    expect(Object.keys(paper).sort()).toEqual(Object.keys(ink).sort());
    expect(paper['--kairos-background-base']).toBe('#fafafa');
    expect(paper['--kairos-text-primary']).toBe('#111114');
    expect(paper['--kairos-accent-primary']).toBe('#5e6ad2');
    expect(paper['--kairos-accent-ink']).toBe('#ffffff');
    expect(paper['--kairos-trade-profit']).toBe('#1a9e63');
    expect(paper['--kairos-trade-loss']).toBe('#d9434f');
  });

  it('adds the settle duration and easing curves to the geometry owner, never to a theme', () => {
    expect(geometryTokens.motion.settle).toBe('480ms');
    expect(geometryTokens.easing).toEqual({ out: 'cubic-bezier(.2,.8,.2,1)', inOut: 'cubic-bezier(.65,0,.35,1)', spring: 'cubic-bezier(.34,1.32,.64,1)' });
    for (const themeId of themeIds) expect(Object.keys(themeRegistry[themeId].tokens).some(key => key.includes('motion') || key.includes('ease'))).toBe(false);
  });
});
