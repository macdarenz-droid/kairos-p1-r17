export const geometryTokens = Object.freeze({
  spacing: Object.freeze({
    0: '0', 1: '0.25rem', 2: '0.5rem', 3: '0.75rem', 4: '1rem',
    5: '1.25rem', 6: '1.5rem', 8: '2rem', 10: '2.5rem', 12: '3rem',
  }),
  radius: Object.freeze({ none: '0', sm: '0.375rem', md: '0.75rem', lg: '1rem', xl: '1.5rem', full: '9999px' }),
  control: Object.freeze({ sm: '2.25rem', md: '2.75rem', lg: '3rem' }),
  layout: Object.freeze({ pagePadding: '1rem', cardGap: '1rem', chartMinHeight: '20rem', navigationHeight: '4rem' }),
  motion: Object.freeze({ instant: '0ms', fast: '120ms', normal: '200ms', slow: '320ms' }),
});

export type GeometryTokens = typeof geometryTokens;
