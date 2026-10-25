// @vitest-environment node
// The check runs inside `vite build`, on Node.
import { describe, expect, it, vi } from 'vitest';
import { describeActivationBuildProblem } from '../src/services/activation';

interface NodeFs { readFileSync(path: string, encoding: 'utf8'): string }
const loadBuiltin = (name: string): Promise<unknown> => import(/* @vite-ignore */ name);
const envExamplePath = decodeURIComponent(new URL('../.env.example', import.meta.url).pathname);

const ENDPOINT = 'VITE_KAIROS_ACTIVATION_ENDPOINT';
const PUBLIC_KEY = 'VITE_KAIROS_ACTIVATION_PUBLIC_KEY_SPKI';
const WHERE = 'Cloudflare Pages → Settings → Variables and Secrets';
const GOOD_ENDPOINT = 'https://kairos-activation.example.workers.dev/activate';

function toBase64(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function publicKeyOf(algorithm: EcKeyGenParams | RsaHashedKeyGenParams): Promise<string> {
  const keys = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']) as CryptoKeyPair;
  return toBase64(await crypto.subtle.exportKey('spki', keys.publicKey));
}

const p256Key = () => publicKeyOf({ name: 'ECDSA', namedCurve: 'P-256' });

/** The settings `.env.example` ships, read from the real file. */
async function readEnvExample(): Promise<Record<string, string>> {
  const fs = await loadBuiltin('node:fs') as NodeFs;
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(envExamplePath, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) env[match[1]] = match[2];
  }
  return env;
}

async function expectRefusedFor(setting: string, env: Record<string, string | undefined>) {
  const message = await describeActivationBuildProblem(env);
  expect(message).toEqual(expect.any(String));
  expect(message).toContain(setting);
  expect(message).toContain(WHERE);
  const other = setting === ENDPOINT ? PUBLIC_KEY : ENDPOINT;
  expect(message).not.toContain(other);
}

describe('T-062d the build stops without the activation settings', () => {
  it('passes a build with an https endpoint and a P-256 public key', async () => {
    expect(await describeActivationBuildProblem({ [ENDPOINT]: GOOD_ENDPOINT, [PUBLIC_KEY]: await p256Key() })).toBeNull();
  });

  it('refuses a missing endpoint, naming it and where to set it', async () => {
    const key = await p256Key();
    await expectRefusedFor(ENDPOINT, { [PUBLIC_KEY]: key });
    await expectRefusedFor(ENDPOINT, { [ENDPOINT]: '   ', [PUBLIC_KEY]: key });
  });

  it('refuses a missing public key, naming it and where to set it', async () => {
    await expectRefusedFor(PUBLIC_KEY, { [ENDPOINT]: GOOD_ENDPOINT });
    await expectRefusedFor(PUBLIC_KEY, { [ENDPOINT]: GOOD_ENDPOINT, [PUBLIC_KEY]: '' });
  });

  it('refuses an http endpoint', async () => {
    await expectRefusedFor(ENDPOINT, { [ENDPOINT]: 'http://kairos-activation.example.workers.dev/activate', [PUBLIC_KEY]: await p256Key() });
  });

  it('names both settings when both are missing', async () => {
    const message = await describeActivationBuildProblem({});
    expect(message).toContain(ENDPOINT);
    expect(message).toContain(PUBLIC_KEY);
    expect(message).toContain(WHERE);
  });

  it('refuses the placeholder key from .env.example', async () => {
    const example = await readEnvExample();
    expect(example[PUBLIC_KEY]).toBeTruthy();
    await expectRefusedFor(PUBLIC_KEY, example);
  });

  it('refuses an RSA key and a P-384 key, naming the key setting', async () => {
    const rsa = await publicKeyOf({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' });
    const p384 = await publicKeyOf({ name: 'ECDSA', namedCurve: 'P-384' });
    await expectRefusedFor(PUBLIC_KEY, { [ENDPOINT]: GOOD_ENDPOINT, [PUBLIC_KEY]: rsa });
    await expectRefusedFor(PUBLIC_KEY, { [ENDPOINT]: GOOD_ENDPOINT, [PUBLIC_KEY]: p384 });
  });

  it('refuses base64 that is shaped like a P-256 key but is not one', async () => {
    const notAPoint = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
    await expectRefusedFor(PUBLIC_KEY, { [ENDPOINT]: GOOD_ENDPOINT, [PUBLIC_KEY]: notAPoint });
  });

  it('stops rather than pass a key it cannot check', async () => {
    const key = await p256Key();
    vi.stubGlobal('crypto', {});
    try {
      await expectRefusedFor(PUBLIC_KEY, { [ENDPOINT]: GOOD_ENDPOINT, [PUBLIC_KEY]: key });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
