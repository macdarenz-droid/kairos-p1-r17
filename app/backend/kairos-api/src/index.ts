/** U1: the Kairos server's entry. Market data, rates and news only; it never receives, stores or returns journal data. */
import type { KairosApiEnv } from './env';
import { handleKairosApiRequest } from './router';
import { KAIROS_API_ROUTES } from './routes';

export default {
  fetch(request, env, ctx) {
    return handleKairosApiRequest(request, env, ctx, { routes: KAIROS_API_ROUTES });
  },
} satisfies ExportedHandler<KairosApiEnv>;
