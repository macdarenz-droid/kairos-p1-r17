import type { D1Migration } from 'cloudflare:test';
import type { ActivationEnv } from '../src/env';

declare global {
  namespace Cloudflare {
    interface Env extends ActivationEnv {
      /** vitest.config.ts: the migrations in migrations/, read when the config loads. */
      readonly TEST_MIGRATIONS: D1Migration[];
      /** vitest.config.ts: the public half of the throwaway signing key (base64 SPKI), to check receipts. */
      readonly TEST_ACTIVATION_PUBLIC_KEY_SPKI: string;
      /** vitest.config.ts: the SQL that CI's deploy job runs (deploy/*.sql), split into statements as wrangler does. */
      readonly TEST_DEPLOY_SQL: { readonly mark: string[]; readonly backfill: string[] };
      /** vitest.config.ts: a second, empty D1, for a database whose 0001 table was made by hand (production). */
      readonly TEST_HAND_MADE_DB: D1Database;
    }
    interface GlobalProps { mainModule: typeof import('../src/index') }
  }
}
