import { describe, expect, it } from 'vitest';
import { describeOnlineServices, describeUnavailable } from '../src/application/online/onlineWords';

const HEALTH = { serverTime: '2026-09-26T10:00:00.000Z', checks: { deviceKey: 'ready', cache: 'ready', limits: 'ready' } } as const;

describe('describeUnavailable', () => {
  it('gives the network failure its words and Try again', () => {
    expect(describeUnavailable({ ok: false, reason: 'transport-failed' }, 'News')).toEqual({
      title: 'Unavailable',
      message: 'News: Kairos could not reach its server. Check your connection, then try again.',
      retryLabel: 'Try again',
      retryAfterSeconds: null,
    });
  });

  it('offers no Try again where a retry cannot help', () => {
    expect(describeUnavailable({ ok: false, reason: 'not-set-up' }, 'News')).toMatchObject({ message: 'News: not set up in this version of Kairos.', retryLabel: null });
    expect(describeUnavailable({ ok: false, reason: 'unavailable', serverReason: 'not-set-up', retryAfterSeconds: null, status: 503 }, 'News')).toMatchObject({ retryLabel: null });
    expect(describeUnavailable({ ok: false, reason: 'unavailable', serverReason: 'device-not-recognised', retryAfterSeconds: null, status: 401 }, 'News')).toMatchObject({ retryLabel: null });
  });

  it('passes the server wait on and covers unknown reasons', () => {
    expect(describeUnavailable({ ok: false, reason: 'unavailable', serverReason: 'rate-limited', retryAfterSeconds: 60, status: 429 }, 'News')).toEqual({
      title: 'Unavailable',
      message: 'News: too many requests from this device. Wait a minute, then try again.',
      retryLabel: 'Try again',
      retryAfterSeconds: 60,
    });
    expect(describeUnavailable({ ok: false, reason: 'unavailable', serverReason: 'teapot', retryAfterSeconds: null, status: 418 }, 'News'))
      .toMatchObject({ message: 'News: unavailable right now. Try again later.', retryLabel: 'Try again' });
  });
});

describe('describeOnlineServices', () => {
  it('says the services work and what it knows about this device', () => {
    const sentences = {
      recognised: 'This device is recognised.',
      'not-sent': 'This device did not send its activation.',
      'not-recognised': 'The server did not recognise this device.',
      'not-checked': 'The server cannot check devices yet.',
    } as const;
    for (const [device, sentence] of Object.entries(sentences)) {
      expect(describeOnlineServices({ ok: true, value: { ...HEALTH, device: device as keyof typeof sentences } })).toEqual({ kind: 'working', text: `Online services are working. ${sentence}` });
    }
  });

  it('uses the Unavailable words for a failure', () => {
    expect(describeOnlineServices({ ok: false, reason: 'transport-failed' })).toEqual({
      kind: 'unavailable',
      words: describeUnavailable({ ok: false, reason: 'transport-failed' }, 'Online services'),
    });
    expect(describeOnlineServices({ ok: false, reason: 'transport-failed' })).toMatchObject({ words: { message: expect.stringMatching(/^Online services: /) } });
  });
});
