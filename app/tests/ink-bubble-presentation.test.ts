import { describe, expect, it } from 'vitest';
import { themeIds, themeRegistry } from '../src/design-system/themes';

const roles = ['--kairos-bubble-art-filter', '--kairos-bubble-art-opacity', '--kairos-bubble-glass', '--kairos-bubble-border', '--kairos-bubble-ring-up', '--kairos-bubble-ring-down', '--kairos-bubble-shadow', '--kairos-bubble-fallback-opacity'] as const;

describe('Ink bubble presentation', () => {
  it('re-tones only through theme tokens that every registered theme declares', () => {
    for (const themeId of themeIds) for (const role of roles) expect(themeRegistry[themeId].tokens[role], `${themeId} ${role}`).toBeTruthy();
  });

  it('earlier themes render byte-identical presentation values: untouched artwork, no glass, no ring', () => {
    for (const legacy of ['kairos-depth', 'cosmic', 'ocean'] as const) {
      const t = themeRegistry[legacy].tokens;
      expect(t['--kairos-bubble-art-filter']).toBe('none');
      expect(t['--kairos-bubble-art-opacity']).toBe('1');
      expect(t['--kairos-bubble-glass']).toBe('none');
      expect(t['--kairos-bubble-border']).toBe('transparent');
      expect(t['--kairos-bubble-ring-up']).toBe('transparent');
      expect(t['--kairos-bubble-ring-down']).toBe('transparent');
      expect(t['--kairos-bubble-shadow']).toBe('none');
      expect(t['--kairos-bubble-fallback-opacity']).toBe('.8');
      expect(t['--kairos-bubble-identity-btc']).toBe('#ffc65c');
      expect(t['--kairos-bubble-identity-eth']).toBe('#9be7ff');
    }
  });

  it('Ink and Paper carry the approved bubble look: monochrome texture, glass gradient, hairline, movement ring, amber and ice identity', () => {
    const ink = themeRegistry.ink.tokens, paper = themeRegistry.paper.tokens;
    expect(ink['--kairos-bubble-art-filter']).toBe('grayscale(1) contrast(.9)');
    expect(ink['--kairos-bubble-art-opacity']).toBe('.28');
    expect(ink['--kairos-bubble-glass']).toContain('radial-gradient(');
    expect(ink['--kairos-bubble-border']).toBe('rgba(255,255,255,.14)');
    expect(ink['--kairos-bubble-ring-up']).toBe('rgba(62,207,142,.45)');
    expect(ink['--kairos-bubble-ring-down']).toBe('rgba(240,97,109,.45)');
    expect(ink['--kairos-bubble-identity-btc']).toBe('#f5b544');
    expect(ink['--kairos-bubble-identity-eth']).toBe('#9db7ff');
    expect(paper['--kairos-bubble-art-opacity']).toBe('.14');
    expect(paper['--kairos-bubble-ring-up']).toBe('rgba(26,158,99,.45)');
    expect(paper['--kairos-bubble-identity-btc']).toBe('#c98a1a');
    expect(ink['--kairos-bubble-fallback-opacity']).toBe('0');
    expect(paper['--kairos-bubble-fallback-opacity']).toBe('0');
    for (const smoke of ['--kairos-bubble-smoke-1', '--kairos-bubble-smoke-4']) { expect(ink[smoke]).toBe('transparent'); expect(paper[smoke]).toBe('transparent'); }
  });
});
