import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

async function exportBase64(format: 'pkcs8' | 'spki', key: CryptoKey): Promise<string> {
  return btoa(String.fromCharCode(...new Uint8Array((await crypto.subtle.exportKey(format, key)) as ArrayBuffer)));
}

/**
 * Tests run in the Workers runtime with the D1 migrations and a throwaway signing key made here, when the config loads.
 * The key never leaves this test run; the real key exists only as the Worker secret KAIROS_ACTIVATION_PRIVATE_KEY.
 */
export default defineConfig(async () => {
  const migrations = await readD1Migrations('migrations');
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
          },
        },
      }),
    ],
  };
});
