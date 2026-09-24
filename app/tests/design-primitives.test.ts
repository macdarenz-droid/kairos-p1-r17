import { describe, expect, it } from 'vitest';
import { designPrimitiveRegistry, typographyTokens } from '../src/design-system';

describe('P2 design primitive registry', () => {
  it('registers the visual canary primitive families before feature UI exists', () => {
    expect(Object.keys(designPrimitiveRegistry)).toEqual(['button', 'input', 'card', 'modal', 'tabs', 'status', 'loading']);
  });

  it('keeps variants finite and centrally owned', () => {
    expect(designPrimitiveRegistry.button.variants).toContain('primary');
    expect(designPrimitiveRegistry.button.variants).toContain('danger');
    expect(designPrimitiveRegistry.input.variants).toEqual(['default', 'error']);
  });

  it('owns typography as theme-neutral foundation tokens', () => {
    expect(typographyTokens.size.md).toBe('1rem');
    expect(typographyTokens.weight.semibold).toBe(600);
    expect(typographyTokens.lineHeight.normal).toBe(1.5);
  });
});
