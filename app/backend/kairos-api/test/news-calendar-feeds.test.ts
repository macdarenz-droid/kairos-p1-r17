import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemoryCache } from '../src/cache';
import type { KairosApiEnv } from '../src/env';
import { buildCalendarAnswer } from '../src/news/calendarFeeds';
import { handleKairosApiRequest } from '../src/router';
import { KAIROS_API_ROUTES } from '../src/routes';

const NOW = Date.parse('2026-09-26T02:00:00Z');
const APP = 'https://kairos-p1-r17.pages.dev';
const times = (source: Parameters<typeof buildCalendarAnswer>[0], texts: string[]) => {
  const data = buildCalendarAnswer(source, texts, NOW)!;
  return { events: data.events.map(({ title, startsAt }) => [title, startsAt]), leftOut: data.leftOut };
};

const FED = '﻿' + JSON.stringify({ events: [
  { title: 'FOMC Meeting', time: '2:00 p.m.', month: '2026-10', days: '28', type: 'FOMC' },
  { title: ' FOMC Minutes', time: '2:00 p.m.', month: '2026-10', days: '7', type: 'FOMC' },
  { title: 'H.4.1 - Factors Affecting Reserve Balances', time: '4:30 p.m.', month: '2026-10', days: '1, 8', type: 'Stat' },
  { title: 'Holiday - Veterans Day', time: '', month: '2026-11', days: '11', type: 'Other' },
  {},
] });

const release = (title: string, releaseDate: string, flags: { published?: boolean; cancelled?: boolean; finalised?: boolean } = {}) =>
  ({ description: { title, release_date: releaseDate, published: flags.published ?? true, cancelled: flags.cancelled ?? false, finalised: flags.finalised ?? true } });
const onsPage = (total: number, releases: unknown[]) => JSON.stringify({ breakdown: { total }, releases });
const ONS_PUBLISHED = onsPage(2, [release('Consumer price inflation, UK: August 2026', '2026-09-16T06:00:00.000Z'), release('Bad date', '16 September')]);
const ONS_UPCOMING = onsPage(3, [
  release('UK Labour Market: October 2026', '2026-10-20T06:00:00.000Z', { published: false }),
  release('GDP monthly estimate, UK: September 2026', '2026-11-13T07:00:00.000Z', { published: false, finalised: false }),
  release('Retail sales, Great Britain: October 2026', '2026-11-20T07:00:00.000Z', { published: false, cancelled: true }),
]);

const CENSUS = `<html><body><table class="sortable" id="calendar"><tr><th>Date</th><th>Time</th><th>Indicator</th></tr>
<tr><td sorttable_customkey="202610150830">October 15</td><td> 8:30 AM </td><td><a href="/retail/index.html">Advance Monthly Sales for Retail and Food Services</a></td></tr>
<tr><td sorttable_customkey="202610171000">October 17</td><td>8:30 AM</td><td><a href="/construction/nrc/index.html">New Residential Construction (Building Permits, Housing Starts,
 and Housing Completions)</a></td></tr>
</table><table><tr><td sorttable_customkey="202610200830">October 20</td><td>8:30 AM</td><td><a href="/x">Outside the calendar</a></td></tr></table></body></html>`;

const ECB_DAY_2 = 'Governing Council of the ECB: monetary policy meeting in Frankfurt (Day 2), followed by press conference';
const ECB = `<dl><dt>28/10/2026</dt><dd>Governing Council of the ECB: monetary policy meeting in Frankfurt (Day 1)</dd>
<dt> 29/10/2026 </dt> <dd>${ECB_DAY_2}</dd>
<dt>05/11/2026</dt><dd>Non-monetary policy meeting of the Governing Council of the ECB: non-monetary policy meeting (Day 2)</dd></dl>`;

const rbaRow = (label: string, cell: string) => `<tr><th scope="row">${label}</th>\n<td>${cell}</td><td>x</td></tr>`;
const RBA = `<h2>Other</h2><table><caption>Board meeting schedules 2026</caption><tr><th>Meeting</th><th>Monetary Policy Board</th></tr>
${rbaRow('1', '31 March&ndash;1 April')}${rbaRow('2', '28&ndash;29 September')}${rbaRow('3', '2&ndash;3 November')}${rbaRow('4', '')}${rbaRow('5', '5 March')}</table>`;

describe('the five more calendar decoders', () => {
  it('fed: a day list gives one event per day at the New York time; a holiday and an empty row count', () => {
    expect(times('fed', [FED])).toEqual({
      events: [
        ['H.4.1 - Factors Affecting Reserve Balances', '2026-10-01T20:30:00.000Z'],
        ['FOMC Minutes', '2026-10-07T18:00:00.000Z'],
        ['H.4.1 - Factors Affecting Reserve Balances', '2026-10-08T20:30:00.000Z'],
        ['FOMC Meeting', '2026-10-28T18:00:00.000Z'],
      ],
      leftOut: 2,
    });
    expect(buildCalendarAnswer('fed', ['not json'], NOW)).toBeNull();
  });

  it('ons: published and finalised releases from both pages, a window one day inside the asked range, and no cut-short page', () => {
    const data = buildCalendarAnswer('ons', [ONS_PUBLISHED, ONS_UPCOMING], NOW)!;
    expect(data.events.map(({ title, startsAt }) => [title, startsAt])).toEqual([
      ['Consumer price inflation, UK: August 2026', '2026-09-16T06:00:00.000Z'],
      ['UK Labour Market: October 2026', '2026-10-20T06:00:00.000Z'],
    ]);
    expect(data.leftOut).toBe(3);
    expect(data.covers).toEqual({ from: '2026-06-27T00:00:00.000Z', to: '2026-12-26T00:00:00.000Z' });
    const cutShort = ONS_UPCOMING.replace('"total":3', '"total":4');
    expect(buildCalendarAnswer('ons', [ONS_PUBLISHED, cutShort], NOW)).toBeNull();
  });

  it('census: a row whose time cell agrees with its key; one that disagrees counts; no calendar table is null', () => {
    expect(times('census', [CENSUS])).toEqual({ events: [['Advance Monthly Sales for Retail and Food Services', '2026-10-15T12:30:00.000Z']], leftOut: 1 });
    expect(buildCalendarAnswer('census', [CENSUS.replace('id="calendar"', 'id="other"')], NOW)).toBeNull();
  });

  it('ecb: only the monetary policy meeting\'s Day 2 gets 14:15 in Frankfurt, with the whole text as title', () => {
    expect(times('ecb', [ECB])).toEqual({ events: [[ECB_DAY_2, '2026-10-29T13:15:00.000Z']], leftOut: 2 });
    expect(buildCalendarAnswer('ecb', ['<html>no meetings</html>'], NOW)).toBeNull();
  });

  it('rba: the second day at 14:30 in Sydney; an empty cell is no meeting; another form counts', () => {
    expect(times('rba', [RBA])).toEqual({
      events: [
        ['Monetary Policy Board', '2026-04-01T03:30:00.000Z'],
        ['Monetary Policy Board', '2026-09-29T04:30:00.000Z'],
        ['Monetary Policy Board', '2026-11-03T03:30:00.000Z'],
      ],
      leftOut: 1,
    });
    expect(times('rba', [RBA.replace('2&ndash;3 November', '2&ndash;3 Novembre')]).leftOut).toBe(2);
    expect(buildCalendarAnswer('rba', [RBA.replace('Board meeting schedules 2026', 'Meetings')], NOW)).toBeNull();
  });
});

describe('the five more calendar routes', () => {
  const limiter = () => ({ limit: vi.fn().mockResolvedValue({ success: true }) });
  const env = (): KairosApiEnv => ({ KAIROS_APP_ORIGINS: APP, KAIROS_API_ANONYMOUS_LIMITER: limiter(), KAIROS_API_DEVICE_LIMITER: limiter() });
  async function call(path: string, fetchImpl: typeof fetch) {
    const ctx = createExecutionContext();
    const response = await handleKairosApiRequest(new Request(`https://kairos-api.example.workers.dev${path}`, { headers: { origin: APP } }), env(), ctx, { routes: KAIROS_API_ROUTES, fetchImpl, now: () => new Date(NOW) });
    await waitOnExecutionContext(ctx);
    return response;
  }

  beforeEach(() => clearMemoryCache());

  it('ons reads exactly its two pages for now', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => new Response(String(input).includes('type-published') ? ONS_PUBLISHED : ONS_UPCOMING, { status: 200, headers: { 'content-type': 'application/json;charset=utf-8' } }));
    const response = await call('/news/calendar/ons', fetchImpl);
    expect(response.status).toBe(200);
    expect(fetchImpl.mock.calls.map(([url]) => String(url)).sort()).toEqual([
      'https://api.beta.ons.gov.uk/v1/search/releases?fromDate=2026-06-26&toDate=2026-09-26&release-type=type-published&sort=release_date_asc&limit=1000',
      'https://api.beta.ons.gov.uk/v1/search/releases?fromDate=2026-09-26&toDate=2026-12-27&release-type=type-upcoming&sort=release_date_asc&limit=1000',
    ]);
    expect((fetchImpl.mock.calls[0][1]!.headers as Record<string, string>).accept).toBe('application/json');
  });

  it('census, ecb and rba ask for text/html and read an HTML answer', async () => {
    for (const [source, body, host] of [['census', CENSUS, 'www.census.gov'], ['ecb', ECB, 'www.ecb.europa.eu'], ['rba', RBA, 'www.rba.gov.au']] as const) {
      const fetchImpl = vi.fn<typeof fetch>(async () => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=UTF-8' } }));
      const response = await call(`/news/calendar/${source}`, fetchImpl);
      expect(response.status, source).toBe(200);
      expect(await response.json(), source).toMatchObject({ ok: true, data: { source } });
      expect(new URL(String(fetchImpl.mock.calls[0][0])).hostname, source).toBe(host);
      expect((fetchImpl.mock.calls[0][1]!.headers as Record<string, string>).accept, source).toBe('text/html');
    }
  });

  it('fed asks for JSON and reads its calendar', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(FED, { status: 200, headers: { 'content-type': 'application/json' } }));
    const response = await call('/news/calendar/fed', fetchImpl);
    expect(response.status).toBe(200);
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://www.federalreserve.gov/json/calendar.json');
    expect((fetchImpl.mock.calls[0][1]!.headers as Record<string, string>).accept).toBe('application/json');
  });
});
