import { describe, expect, it, vi } from 'vitest';
import { RemoteActivationAdapter } from '../src/services/activation/RemoteActivationAdapter';

const request = {
  inviteCode: 'one-time-user-input',
  appVersion: '0.1.0',
  buildId: 'test-build',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('RemoteActivationAdapter', () => {
  it('requires an injected HTTPS endpoint', () => {
    expect(() => new RemoteActivationAdapter({ endpoint: 'http://example.test/activate' }))
      .toThrow('Activation endpoint must use HTTPS.');
  });

  it('posts only the activation request contract and accepts a valid server receipt', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      ok: true,
      receipt: {
        receiptVersion: 1,
        activationId: 'activation-1',
        issuedAt: '2026-08-31T10:30:00.000Z',
        verifierPayload: 'server-payload',
        verifierSignature: 'server-signature',
      },
    }));
    const adapter = new RemoteActivationAdapter({
      endpoint: 'https://activation.example.test/v1/activate',
      fetchImpl,
    });

    await expect(adapter.validateInvite(request)).resolves.toEqual({
      ok: true,
      receipt: {
        receiptVersion: 1,
        activationId: 'activation-1',
        issuedAt: '2026-08-31T10:30:00.000Z',
        verifierPayload: 'server-payload',
        verifierSignature: 'server-signature',
      },
    });

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    });
    expect(JSON.parse(String(init?.body))).toEqual(request);
  });

  it.each([
    ['invalid-code', 'invalid-code'],
    ['expired-code', 'expired-code'],
    ['already-used', 'already-used'],
  ] as const)('maps server rejection %s without client-side invite decisions', async (serverReason, expected) => {
    const adapter = new RemoteActivationAdapter({
      endpoint: 'https://activation.example.test/v1/activate',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: false, reason: serverReason }, 400)),
    });
    await expect(adapter.validateInvite(request)).resolves.toEqual({ ok: false, reason: expected });
  });

  it('maps HTTP 429 to rate-limited and server failures to service-error', async () => {
    const limited = new RemoteActivationAdapter({
      endpoint: 'https://activation.example.test/v1/activate',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 429 })),
    });
    const failed = new RemoteActivationAdapter({
      endpoint: 'https://activation.example.test/v1/activate',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })),
    });
    await expect(limited.validateInvite(request)).resolves.toEqual({ ok: false, reason: 'rate-limited' });
    await expect(failed.validateInvite(request)).resolves.toEqual({ ok: false, reason: 'service-error' });
  });

  it('fails closed on malformed success payloads', async () => {
    const adapter = new RemoteActivationAdapter({
      endpoint: 'https://activation.example.test/v1/activate',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true, receipt: { activationId: 'forged' } })),
    });
    await expect(adapter.validateInvite(request)).resolves.toEqual({ ok: false, reason: 'service-error' });
  });

  it('maps transport failure to network-unavailable', async () => {
    const adapter = new RemoteActivationAdapter({
      endpoint: 'https://activation.example.test/v1/activate',
      fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network down')),
    });
    await expect(adapter.validateInvite(request)).resolves.toEqual({ ok: false, reason: 'network-unavailable' });
  });
});
