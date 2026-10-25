import { describe, expect, it } from 'vitest';
import { parseActivationDeploymentConfig } from '../src/services/activation';

const VALID_KEY = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

describe('P7.7 activation deployment configuration', () => {
  it('accepts an HTTPS endpoint and public verification key', () => {
    const result = parseActivationDeploymentConfig({
      endpoint: ' https://activation.example.com/v1/activate ',
      publicKeySpkiBase64: `  ${VALID_KEY}  `,
    });

    expect(result).toEqual({
      ok: true,
      config: {
        endpoint: 'https://activation.example.com/v1/activate',
        publicKeySpkiBase64: VALID_KEY,
      },
    });
  });

  it('rejects missing deployment inputs', () => {
    expect(parseActivationDeploymentConfig({ publicKeySpkiBase64: VALID_KEY })).toEqual({
      ok: false,
      reason: 'missing-endpoint',
    });
    expect(parseActivationDeploymentConfig({ endpoint: 'https://activation.example.com/v1/activate' })).toEqual({
      ok: false,
      reason: 'missing-public-key',
    });
  });

  it('rejects non-HTTPS or credential-bearing endpoints', () => {
    expect(parseActivationDeploymentConfig({
      endpoint: 'http://activation.example.com/v1/activate',
      publicKeySpkiBase64: VALID_KEY,
    })).toEqual({ ok: false, reason: 'invalid-endpoint' });

    expect(parseActivationDeploymentConfig({
      endpoint: 'https://user:pass@activation.example.com/v1/activate',
      publicKeySpkiBase64: VALID_KEY,
    })).toEqual({ ok: false, reason: 'invalid-endpoint' });
  });

  it('rejects endpoint query/hash decoration and malformed public keys', () => {
    expect(parseActivationDeploymentConfig({
      endpoint: 'https://activation.example.com/v1/activate?token=nope',
      publicKeySpkiBase64: VALID_KEY,
    })).toEqual({ ok: false, reason: 'invalid-endpoint' });

    expect(parseActivationDeploymentConfig({
      endpoint: 'https://activation.example.com/v1/activate',
      publicKeySpkiBase64: 'not a base64 spki',
    })).toEqual({ ok: false, reason: 'invalid-public-key' });
  });
});
