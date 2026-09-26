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

describe('describeUnavailable: every failure in full', () => {
  it('gives each failure its sentence, its retry and its wait', () => {
    const server = (serverReason: string, retryAfterSeconds: number | null, status: number) => ({ ok: false as const, reason: 'unavailable' as const, serverReason, retryAfterSeconds, status });
    const cases: Array<[Parameters<typeof describeUnavailable>[0], string, 'Try again' | null, number | null]> = [
      [{ ok: false, reason: 'transport-failed' }, 'News: Kairos could not reach its server. Check your connection, then try again.', 'Try again', null],
      [{ ok: false, reason: 'invalid-response', status: 200 }, 'News: the answer could not be read. Try again later.', 'Try again', null],
      [server('rate-limited', 60, 429), 'News: too many requests from this device. Wait a minute, then try again.', 'Try again', 60],
      [server('source-unavailable', 30, 503), 'News: the source did not answer. Try again in a moment.', 'Try again', 30],
      [server('not-set-up', null, 503), 'News: not ready on the Kairos server yet.', null, null],
      [server('device-not-recognised', null, 401), 'News: the Kairos server did not recognise this device.', null, null],
      [server('teapot', 5, 418), 'News: unavailable right now. Try again later.', 'Try again', 5],
    ];
    for (const [failure, message, retryLabel, retryAfterSeconds] of cases) {
      expect(describeUnavailable(failure, 'News'), JSON.stringify(failure)).toEqual({ title: 'Unavailable', message, retryLabel, retryAfterSeconds });
    }
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
