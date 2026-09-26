import { describe, expect, it, vi } from 'vitest';
import { createKairosApiClient } from '../src/services/kairos-api/kairosApi';
import { createNewsApiPort } from '../src/services/kairos-api/newsApi';

const BASE = 'https://kairos-api.example.workers.dev';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const KEY = '0123456789abcdef';
const BLS = {
  source: 'bls',
  fetchedAt: '2026-09-24T03:00:00.000Z',
  covers: { from: '2026-09-01T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z' },
  events: [{ key: KEY, title: 'Consumer Price Index', startsAt: '2026-09-24T12:30:00.000Z' }],
  leftOut: 0,
};
const HEADLINES = {
  source: 'yahoo',
  fetchedAt: '2026-09-24T03:00:00.000Z',
  items: [{ title: 'Stocks rise', url: 'https://finance.yahoo.com/news/a.html', publishedAt: '2026-09-24T02:00:00.000Z', publisher: 'Reuters' }],
  leftOut: 1,
};
function port(body: unknown, status = 200) {
  const fetchImpl = vi.fn<typeof fetch>(async () => json(body, status));
  return { fetchImpl, news: createNewsApiPort(createKairosApiClient({ baseUrl: BASE, fetchImpl })) };
}

describe('the news routes through the Kairos server client', () => {
  it('asks /news/calendar/<source> and decodes a calendar', async () => {
    const { fetchImpl, news } = port({ apiVersion: 1, ok: true, data: BLS });
    expect(news.setUp).toBe(true);
    expect(await news.calendar('bls')).toEqual({ ok: true, value: BLS });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE}/news/calendar/bls`);
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error', cache: 'default' });
  });

  it('asks /news/headlines/<source> and decodes headlines', async () => {
    const { fetchImpl, news } = port({ apiVersion: 1, ok: true, data: HEADLINES });
    expect(await news.headlines('yahoo')).toEqual({ ok: true, value: HEADLINES });
    expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE}/news/headlines/yahoo`);
  });

  it('passes the server\'s unavailable answer on as the client gives it', async () => {
    const { news } = port({ apiVersion: 1, ok: false, error: 'unavailable', reason: 'source-unavailable', retryAfter: 30 }, 502);
    expect(await news.calendar('bls')).toEqual({ ok: false, reason: 'unavailable', serverReason: 'source-unavailable', retryAfterSeconds: 30, status: 502 });
  });

  it('is not set up without an address, and never asks', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const news = createNewsApiPort(createKairosApiClient({ baseUrl: null, fetchImpl }));
    expect(news.setUp).toBe(false);
    expect(await news.calendar('bls')).toEqual({ ok: false, reason: 'not-set-up' });
    expect(await news.headlines('yahoo')).toEqual({ ok: false, reason: 'not-set-up' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a source id that is not one before any request', async () => {
    const { fetchImpl, news } = port({ apiVersion: 1, ok: true, data: BLS });
    await expect(news.calendar('../x')).rejects.toBeInstanceOf(TypeError);
    await expect(news.headlines('BLS')).rejects.toBeInstanceOf(TypeError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a calendar that breaks any rule as an invalid response', async () => {
    const event = BLS.events[0];
    const broken: Array<[string, unknown]> = [
      ['another source', { ...BLS, source: 'bea' }],
      ['a 17-character key', { ...BLS, events: [{ ...event, key: `${KEY}0` }] }],
      ['a non-canonical time', { ...BLS, events: [{ ...event, startsAt: '2026-09-24T12:30:00Z' }] }],
      ['covers backwards', { ...BLS, covers: { from: '2026-10-31T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' } }],
      ['2,001 events', { ...BLS, events: Array.from({ length: 2_001 }, () => event) }],
      ['leftOut below zero', { ...BLS, leftOut: -1 }],
      ['a title with spaces around it', { ...BLS, events: [{ ...event, title: ' Consumer Price Index' }] }],
    ];
    for (const [label, data] of broken) {
      const { news } = port({ apiVersion: 1, ok: true, data });
      expect(await news.calendar('bls'), label).toEqual({ ok: false, reason: 'invalid-response', status: 200 });
    }
    const { news } = port({ apiVersion: 1, ok: true, data: { ...BLS, events: Array.from({ length: 2_000 }, () => event) } });
    expect((await news.calendar('bls')).ok).toBe(true);
  });

  it('refuses headlines that break any rule as an invalid response', async () => {
    const item = HEADLINES.items[0];
    const broken: Array<[string, unknown]> = [
      ['21 items', { ...HEADLINES, items: Array.from({ length: 21 }, () => item) }],
      ['an 81-character publisher', { ...HEADLINES, items: [{ ...item, publisher: 'p'.repeat(81) }] }],
      ['another source', { ...HEADLINES, source: 'fed' }],
      ['a 301-character title', { ...HEADLINES, items: [{ ...item, title: 't'.repeat(301) }] }],
      ['leftOut below zero', { ...HEADLINES, leftOut: -1 }],
    ];
    for (const [label, data] of broken) {
      const { news } = port({ apiVersion: 1, ok: true, data });
      expect(await news.headlines('yahoo'), label).toEqual({ ok: false, reason: 'invalid-response', status: 200 });
    }
    const { news } = port({ apiVersion: 1, ok: true, data: { ...HEADLINES, items: Array.from({ length: 20 }, () => ({ ...item, publisher: null })) } });
    expect((await news.headlines('yahoo')).ok).toBe(true);
  });
});
