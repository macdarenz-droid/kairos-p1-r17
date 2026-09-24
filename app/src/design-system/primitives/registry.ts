export const designPrimitiveRegistry = Object.freeze({
  button: Object.freeze({ variants: ['primary', 'secondary', 'ghost', 'danger'] as const, sizes: ['sm', 'md', 'lg'] as const }),
  input: Object.freeze({ variants: ['default', 'error'] as const, sizes: ['sm', 'md', 'lg'] as const }),
  card: Object.freeze({ variants: ['base', 'raised'] as const }),
  modal: Object.freeze({ variants: ['standard'] as const }),
  tabs: Object.freeze({ variants: ['standard'] as const }),
  status: Object.freeze({ variants: ['success', 'warning', 'error', 'info'] as const }),
  loading: Object.freeze({ variants: ['inline', 'block'] as const }),
} as const);

export type DesignPrimitiveName = keyof typeof designPrimitiveRegistry;
export type ButtonVariant = (typeof designPrimitiveRegistry.button.variants)[number];
export type ButtonSize = (typeof designPrimitiveRegistry.button.sizes)[number];
export type InputVariant = (typeof designPrimitiveRegistry.input.variants)[number];
export type InputSize = (typeof designPrimitiveRegistry.input.sizes)[number];
