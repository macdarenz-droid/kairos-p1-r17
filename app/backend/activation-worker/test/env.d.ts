import type { D1Migration } from 'cloudflare:test';
import type { ActivationEnv } from '../src/env';

declare global {
  namespace Cloudflare {
    interface Env extends ActivationEnv {
      /** vitest.config.ts: the migrations in migrations/, read when the config loads. */
      readonly TEST_MIGRATIONS: D1Migration[];
      /** vitest.config.ts: the public half of the throwaway signing key (base64 SPKI), to check receipts. */
      readonly TEST_ACTIVATION_PUBLIC_KEY_SPKI: string;
    }
    interface GlobalProps { mainModule: typeof import('../src/index') }
  }
}
