import type { KairosApiEnv } from '../src/env';

declare global {
  namespace Cloudflare {
    interface Env extends KairosApiEnv {}
    interface GlobalProps { mainModule: typeof import('../src/index') }
  }
}
