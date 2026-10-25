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

  it('posts only the activation request contract (with D275\'s request id and device name) and accepts a valid server receipt', async () => {
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

    await expect(adapter.validateInvite({ ...request, requestId: '0123456789abcdef0123456789abcdef', deviceLabel: 'iPhone · Safari' })).resolves.toEqual({
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
    expect(JSON.parse(String(init?.body))).toEqual({
      inviteCode: 'one-time-user-input',
      appVersion: '0.1.0',
      buildId: 'test-build',
      requestId: '0123456789abcdef0123456789abcdef',
      deviceLabel: 'iPhone · Safari',
    });
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

  it('reads how many devices a used-up code allows, and leaves out a number it cannot read', async () => {
    const answer = (body: unknown) => new RemoteActivationAdapter({
      endpoint: 'https://activation.example.test/v1/activate',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body, 403)),
    }).validateInvite(request);
    await expect(answer({ ok: false, reason: 'already-used', deviceLimit: 3 })).resolves.toStrictEqual({ ok: false, reason: 'already-used', deviceLimit: 3 });
    await expect(answer({ ok: false, reason: 'already-used', deviceLimit: 1 })).resolves.toStrictEqual({ ok: false, reason: 'already-used', deviceLimit: 1 });
    await expect(answer({ ok: false, reason: 'already-used', deviceLimit: 10 })).resolves.toStrictEqual({ ok: false, reason: 'already-used', deviceLimit: 10 });
    for (const deviceLimit of [0, 11, 2.5, -3, '3', null, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(answer({ ok: false, reason: 'already-used', deviceLimit })).resolves.toStrictEqual({ ok: false, reason: 'already-used' });
    }
    // A number beside another reason means nothing.
    await expect(answer({ ok: false, reason: 'invalid-code', deviceLimit: 3 })).resolves.toStrictEqual({ ok: false, reason: 'invalid-code' });
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
