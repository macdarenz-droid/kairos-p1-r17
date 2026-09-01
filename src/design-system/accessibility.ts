export const accessibilityContract = Object.freeze({
  target: Object.freeze({
    minimumCssPixels: 24,
    preferredControlCssPixels: 44,
  }),
  focus: Object.freeze({
    indicatorWidthCssPixels: 2,
    indicatorOffsetCssPixels: 2,
    selector: ':focus-visible',
  }),
  motion: Object.freeze({
    preference: 'prefers-reduced-motion: reduce',
    nonEssentialDuration: 'var(--kairos-motion-instant)',
  }),
  semantics: Object.freeze({
    button: 'button',
    link: 'a',
    textInput: 'input',
    multilineInput: 'textarea',
    select: 'select',
  }),
  status: Object.freeze({
    requiresTextEquivalent: true,
    colorAloneIsInsufficient: true,
  }),
} as const);

export type AccessibilityContract = typeof accessibilityContract;
