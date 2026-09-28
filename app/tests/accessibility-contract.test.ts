import { describe, expect, it } from 'vitest';
import { accessibilityContract } from '../src/design-system/accessibility';

describe('P2.3 accessibility contract', () => {
  it('keeps practical interaction geometry above the WCAG 2.2 minimum target', () => {
    expect(accessibilityContract.target.minimumCssPixels).toBe(24);
    expect(accessibilityContract.target.preferredControlCssPixels).toBeGreaterThanOrEqual(44);
  });

  it('registers the visible-focus and reduced-motion contract', () => {
    expect(accessibilityContract.focus.selector).toBe(':focus-visible');
    expect(accessibilityContract.focus.indicatorWidthCssPixels).toBeGreaterThanOrEqual(2);
    expect(accessibilityContract.motion.preference).toBe('prefers-reduced-motion: reduce');
    expect(accessibilityContract.motion.nonEssentialDuration).toBe('var(--kairos-motion-instant)');
  });

  it('does not allow status meaning to rely on color alone', () => {
    expect(accessibilityContract.status.requiresTextEquivalent).toBe(true);
    expect(accessibilityContract.status.colorAloneIsInsufficient).toBe(true);
  });

  it('registers native semantic elements for core interactions', () => {
    expect(accessibilityContract.semantics).toEqual({
      button: 'button', link: 'a', textInput: 'input', multilineInput: 'textarea', select: 'select',
    });
  });
});
