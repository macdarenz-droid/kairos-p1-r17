export interface ActivationDeploymentConfig {
  readonly endpoint: string;
  readonly publicKeySpkiBase64: string;
}

export type ActivationDeploymentConfigResult =
  | { readonly ok: true; readonly config: ActivationDeploymentConfig }
  | {
      readonly ok: false;
      readonly reason:
        | 'missing-endpoint'
        | 'invalid-endpoint'
        | 'missing-public-key'
        | 'invalid-public-key';
    };

function normalizeBase64(value: string): string | null {
  const compact = value.replace(/\s+/g, '');
  if (!compact || compact.length < 16 || compact.length % 4 === 1) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) return null;
  return compact;
}

function normalizeHttpsEndpoint(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) return null;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (url.search || url.hash) return null;
  return url.href;
}

type EndpointRead =
  | { readonly ok: true; readonly endpoint: string }
  | { readonly ok: false; readonly reason: 'missing-endpoint' | 'invalid-endpoint' };

type PublicKeyRead =
  | { readonly ok: true; readonly publicKeySpkiBase64: string }
  | { readonly ok: false; readonly reason: 'missing-public-key' | 'invalid-public-key' };

function readEndpoint(value: string | undefined): EndpointRead {
  const raw = value?.trim();
  if (!raw) return { ok: false, reason: 'missing-endpoint' };
  const endpoint = normalizeHttpsEndpoint(raw);
  return endpoint ? { ok: true, endpoint } : { ok: false, reason: 'invalid-endpoint' };
}

function readPublicKey(value: string | undefined): PublicKeyRead {
  const raw = value?.trim();
  if (!raw) return { ok: false, reason: 'missing-public-key' };
  const publicKeySpkiBase64 = normalizeBase64(raw);
  return publicKeySpkiBase64 ? { ok: true, publicKeySpkiBase64 } : { ok: false, reason: 'invalid-public-key' };
}

export function parseActivationDeploymentConfig(input: {
  readonly endpoint?: string;
  readonly publicKeySpkiBase64?: string;
}): ActivationDeploymentConfigResult {
  const endpoint = readEndpoint(input.endpoint);
  if (!endpoint.ok) return endpoint;

  const publicKey = readPublicKey(input.publicKeySpkiBase64);
  if (!publicKey.ok) return publicKey;

  return {
    ok: true,
    config: {
      endpoint: endpoint.endpoint,
      publicKeySpkiBase64: publicKey.publicKeySpkiBase64,
    },
  };
}

/** The two build settings the app reads (`features/activation/ActivationBootstrap.tsx`). */
const KAIROS_ACTIVATION_ENDPOINT_SETTING = 'VITE_KAIROS_ACTIVATION_ENDPOINT';
const KAIROS_ACTIVATION_PUBLIC_KEY_SETTING = 'VITE_KAIROS_ACTIVATION_PUBLIC_KEY_SPKI';

const EXAMPLE_ENDPOINT = 'https://kairos-activation.<subdomain>.workers.dev/activate';

const BUILD_PROBLEM_WORDS = {
  'missing-endpoint': `${KAIROS_ACTIVATION_ENDPOINT_SETTING} is not set. It is the activation Worker's address, like ${EXAMPLE_ENDPOINT}.`,
  'invalid-endpoint': `${KAIROS_ACTIVATION_ENDPOINT_SETTING} must be an https:// address with no user name, password, "?" or "#", like ${EXAMPLE_ENDPOINT}.`,
  'missing-public-key': `${KAIROS_ACTIVATION_PUBLIC_KEY_SETTING} is not set. It is the public half of the activation Worker's signing key: a P-256 public key, as base64 SPKI on one line.`,
  'invalid-public-key': `${KAIROS_ACTIVATION_PUBLIC_KEY_SETTING} is not a P-256 public key. Paste the public half of the activation Worker's signing key, as base64 SPKI on one line.`,
} as const;

const UNCHECKABLE_PUBLIC_KEY = `${KAIROS_ACTIVATION_PUBLIC_KEY_SETTING} could not be checked: this Node.js has no WebCrypto. Build with Node 22 (app/.nvmrc).`;

/** Imports the key the way the app's verifier does (`EcdsaActivationReceiptVerifier.ts`); false when WebCrypto refuses it. */
async function importsAsP256VerifyKey(subtle: SubtleCrypto, publicKeySpkiBase64: string): Promise<boolean> {
  try {
    const binary = atob(publicKeySpkiBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    await subtle.importKey('spki', bytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return true;
  } catch {
    return false;
  }
}

/**
 * The release build's check (D284): null when both activation settings are usable, otherwise a plain
 * message naming each setting that is missing or wrong and where to set it. A build without them would
 * ship an app that shows every trader only "Activation is not configured".
 */
export async function describeActivationBuildProblem(env: Readonly<Record<string, string | undefined>>): Promise<string | null> {
  const problems: string[] = [];

  const endpoint = readEndpoint(env[KAIROS_ACTIVATION_ENDPOINT_SETTING]);
  if (!endpoint.ok) problems.push(BUILD_PROBLEM_WORDS[endpoint.reason]);

  const publicKey = readPublicKey(env[KAIROS_ACTIVATION_PUBLIC_KEY_SETTING]);
  if (!publicKey.ok) {
    problems.push(BUILD_PROBLEM_WORDS[publicKey.reason]);
  } else {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) problems.push(UNCHECKABLE_PUBLIC_KEY);
    else if (!(await importsAsP256VerifyKey(subtle, publicKey.publicKeySpkiBase64))) problems.push(BUILD_PROBLEM_WORDS['invalid-public-key']);
  }

  if (problems.length === 0) return null;
  return [
    'Kairos stopped this build: the activation settings are not ready.',
    ...problems.map((problem) => `- ${problem}`),
    'Fix this in Cloudflare Pages → Settings → Variables and Secrets, for Production, and for Preview if you use preview builds. Then build again.',
    'A build without these settings would show every trader only "Activation is not configured".',
  ].join('\n');
}
