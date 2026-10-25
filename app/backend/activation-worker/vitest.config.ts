import { cloudflareTest, readD1Migrations, type D1Migration } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

async function exportBase64(format: 'pkcs8' | 'spki', key: CryptoKey): Promise<string> {
  return btoa(String.fromCharCode(...new Uint8Array((await crypto.subtle.exportKey(format, key)) as ArrayBuffer)));
}

/** One deploy/*.sql file split into statements, as `wrangler d1 execute --local` splits it (wrangler's splitSqlQuery). */
function deploySql(files: readonly D1Migration[], name: string): string[] {
  const file = files.find((candidate) => candidate.name === name);
  if (file === undefined) throw new Error(`deploy/${name} is missing.`);
  return file.queries;
}

/**
 * Tests run in the Workers runtime with the D1 migrations and a throwaway signing key made here, when the config loads.
 * The key never leaves this test run; the real key exists only as the Worker secret KAIROS_ACTIVATION_PRIVATE_KEY.
 * CI's deploy SQL (deploy/) is handed in too, with a second empty D1 to run it on.
 */
export default defineConfig(async () => {
  const migrations = await readD1Migrations('migrations');
  const deploy = await readD1Migrations('deploy');
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            KAIROS_ACTIVATION_PRIVATE_KEY: await exportBase64('pkcs8', pair.privateKey),
            TEST_ACTIVATION_PUBLIC_KEY_SPKI: await exportBase64('spki', pair.publicKey),
            TEST_MIGRATIONS: migrations,
            TEST_DEPLOY_SQL: { mark: deploySql(deploy, 'mark-hand-made-table.sql'), backfill: deploySql(deploy, 'backfill-devices.sql') },
          },
          d1Databases: { TEST_HAND_MADE_DB: 'test-hand-made-db' },
        },
      }),
    ],
  };
});
