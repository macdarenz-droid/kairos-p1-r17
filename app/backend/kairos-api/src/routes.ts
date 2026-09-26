/** U1: the route table. Every route the Kairos server answers is listed here; nothing else is ever answered. */
import type { KairosApiRoute } from './router';

const ready = (present: boolean) => (present ? 'ready' : 'missing');

export const KAIROS_API_ROUTES: readonly KairosApiRoute[] = Object.freeze([
  {
    id: 'health',
    path: '/health',
    query: {},
    async handle({ env, now }) {
      return {
        ok: true,
        data: {
          service: 'kairos-api',
          serverTime: now.toISOString(),
          checks: {
            deviceKey: ready(typeof env.KAIROS_ACTIVATION_PUBLIC_KEY_SPKI === 'string' && env.KAIROS_ACTIVATION_PUBLIC_KEY_SPKI.trim() !== ''),
            cache: ready(env.KAIROS_API_CACHE !== undefined),
            limits: ready(env.KAIROS_API_DEVICE_LIMITER !== undefined && env.KAIROS_API_ANONYMOUS_LIMITER !== undefined),
          },
        },
      };
    },
  },
]);
