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

export function parseActivationDeploymentConfig(input: {
  readonly endpoint?: string;
  readonly publicKeySpkiBase64?: string;
}): ActivationDeploymentConfigResult {
  const rawEndpoint = input.endpoint?.trim();
  if (!rawEndpoint) return { ok: false, reason: 'missing-endpoint' };

  const endpoint = normalizeHttpsEndpoint(rawEndpoint);
  if (!endpoint) return { ok: false, reason: 'invalid-endpoint' };

  const rawPublicKey = input.publicKeySpkiBase64?.trim();
  if (!rawPublicKey) return { ok: false, reason: 'missing-public-key' };

  const publicKeySpkiBase64 = normalizeBase64(rawPublicKey);
  if (!publicKeySpkiBase64) return { ok: false, reason: 'invalid-public-key' };

  return {
    ok: true,
    config: {
      endpoint,
      publicKeySpkiBase64,
    },
  };
}
