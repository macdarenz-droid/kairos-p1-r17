export const typographyTokens = Object.freeze({
  family: Object.freeze({
    sans: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  }),
  size: Object.freeze({ xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.25rem', xxl: '1.5rem' }),
  weight: Object.freeze({ regular: 400, medium: 500, semibold: 600, bold: 700 }),
  lineHeight: Object.freeze({ tight: 1.2, normal: 1.5, relaxed: 1.65 }),
});

export type TypographyTokens = typeof typographyTokens;
