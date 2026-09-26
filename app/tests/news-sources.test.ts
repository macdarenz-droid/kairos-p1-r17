import { describe, expect, it } from 'vitest';
import { projectNewsNearTrade, type NewsNearTradeInput } from '../src/application/economic-calendar/newsNearTrades';
import { economicEventId, isEconomicEventRecordShape, type EconomicEventRecord } from '../src/domain/economic-calendar/economicEvent';
import { economicEventName, economicEventSize, rateOfficialRelease } from '../src/domain/economic-calendar/newsImpact';
import { NEWS_CALENDAR_SOURCE_IDS, NEWS_HEADLINE_SOURCE_IDS, NEWS_SOURCES, isAllowedNewsLink } from '../src/domain/economic-calendar/newsSources';

const CPI_BLS: EconomicEventRecord = {
  id: 'bls:3bc656751421b9fb',
  source: 'bls',
  title: 'Consumer Price Index',
  currency: 'USD',
  startsAt: '2026-09-24T12:30:00.000Z',
  impact: null,
  expected: null,
  previous: null,
  actual: null,
  savedAt: '2026-09-24T03:00:00.000Z',
  fetchedAt: '2026-09-24T02:55:00.000Z',
};
const REAL_EARNINGS: EconomicEventRecord = { ...CPI_BLS, title: 'Real Earnings' };
const TYPED: EconomicEventRecord = { ...CPI_BLS, id: economicEventId('typed', 'speech'), source: 'typed', title: 'ECB President speaks', impact: 'medium', fetchedAt: null };
const trade: NewsNearTradeInput = { status: 'closed', openedAt: '2026-09-24T12:42:00.000Z', closedAt: '2026-09-24T13:30:00.000Z' };

describe('T-046d the news sources', () => {
  it('lists the calendar and headline sources with their names, pages and currencies', () => {
    expect(NEWS_CALENDAR_SOURCE_IDS).toEqual(['fed', 'bls', 'bea', 'census', 'ecb', 'eurostat', 'ons', 'boc', 'rba']);
    expect(NEWS_HEADLINE_SOURCE_IDS).toEqual(['fed', 'ecb', 'boc', 'bea', 'rba', 'yahoo']);
    expect(NEWS_SOURCES.ons.currency).toBe('GBP');
    expect(NEWS_SOURCES.yahoo.currency).toBeNull();
    for (const source of Object.values(NEWS_SOURCES)) expect(source.page.startsWith('https://')).toBe(true);
  });

  it('allows a headline link only over https to a host listed for its source', () => {
    expect(isAllowedNewsLink('yahoo', 'https://finance.yahoo.com/news/a.html')).toBe(true);
    expect(isAllowedNewsLink('bea', 'https://apps.bea.gov/x')).toBe(true);
    for (const url of ['http://finance.yahoo.com/a', 'https://evil.example/a', 'https://u:p@finance.yahoo.com/a', 'javascript:alert(1)', 'not a url']) {
      expect(isAllowedNewsLink('yahoo', url), url).toBe(false);
    }
  });
});

describe("T-046d Kairos's size list", () => {
  it('rates real official titles, and leaves unlisted ones out', () => {
    const rated = (source: Parameters<typeof rateOfficialRelease>[0], title: string) => rateOfficialRelease(source, title);
    expect(rated('fed', 'FOMC Meeting')).toEqual({ size: 'high', plainName: 'US interest rate decision' });
    expect(rated('fed', 'FOMC meeting')).toEqual({ size: 'high', plainName: 'US interest rate decision' });
    expect(rated('fed', 'Speech - Chair Jerome H. Powell')?.size).toBe('medium');
    expect(rated('fed', 'Speech - Vice Chair Philip N. Jefferson')).toBeNull();
    expect(rated('bls', 'Employment Situation')?.size).toBe('high');
    expect(rated('bls', 'Employment Situation of Veterans')).toBeNull();
    expect(rated('bea', 'GDP (Advance Estimate), 3rd Quarter 2026')?.size).toBe('high');
    expect(rated('bea', 'Gross Domestic Product, 4th Quarter and Year 2024 (Advance Estimate)')?.size).toBe('high');
    expect(rated('bea', 'GDP (Third Estimate), Industries, Corporate Profits, State GDP, and State Personal Income, 2nd Quarter 2026; State PCE, 2025')?.size).toBe('medium');
    expect(rated('bea', 'Consumer Price Index')).toBeNull();
    expect(rated('census', 'U.S. International Trade in Goods and Services')).toBeNull();
    expect(rated('ecb', 'Governing Council of the ECB: monetary policy meeting in Frankfurt (Day 2), followed by press conference')?.size).toBe('high');
    expect(rated('ecb', 'Governing Council of the ECB: monetary policy meeting in Frankfurt (Day 1)')).toBeNull();
    expect(rated('eurostat', 'Flash estimate inflation euro area')?.size).toBe('high');
    expect(rated('ons', 'Consumer price inflation, UK: September 2026')?.size).toBe('high');
    expect(rated('ons', 'Consumer price inflation, UK: September 2026 time series')).toBeNull();
    expect(rated('boc', 'Interest Rate Announcement and Monetary Policy Report')?.size).toBe('high');
    expect(rated('boc', 'Christmas Day')).toBeNull();
    expect(rated('rba', 'Monetary Policy Board')?.size).toBe('high');
  });
});

describe('T-046d a fetched row', () => {
  it('has its own stored shape: fetchedAt set, no size, a calendar source and a whole title', () => {
    expect(isEconomicEventRecordShape(CPI_BLS)).toBe(true);
    expect(isEconomicEventRecordShape({ ...CPI_BLS, fetchedAt: null })).toBe(false);
    expect(isEconomicEventRecordShape({ ...CPI_BLS, impact: 'high' })).toBe(false);
    expect(isEconomicEventRecordShape({ ...CPI_BLS, id: 'fed:3bc656751421b9fb' })).toBe(false);
    expect(isEconomicEventRecordShape({ ...CPI_BLS, source: 'yahoo' })).toBe(false);
    expect(isEconomicEventRecordShape({ ...CPI_BLS, title: 'x'.repeat(200) })).toBe(true);
    expect(isEconomicEventRecordShape({ ...CPI_BLS, title: 'x'.repeat(201) })).toBe(false);
    expect(isEconomicEventRecordShape(TYPED)).toBe(true);
    expect(isEconomicEventRecordShape({ ...TYPED, fetchedAt: '2026-09-24T02:55:00.000Z' })).toBe(false);
  });

  it("is sized and named by Kairos's list; typed news keeps the trader's size", () => {
    expect(economicEventSize(CPI_BLS)).toEqual({ size: 'high', ratedBy: 'kairos' });
    expect(economicEventName(CPI_BLS)).toBe('US inflation (CPI)');
    expect(economicEventSize(REAL_EARNINGS)).toEqual({ size: null, ratedBy: 'kairos' });
    expect(economicEventName(REAL_EARNINGS)).toBe('Real Earnings');
    expect(economicEventSize(TYPED)).toEqual({ size: 'medium', ratedBy: 'you' });
  });

  it('counts as big news near a trade only when Kairos rates it big', () => {
    expect(projectNewsNearTrade(trade, [CPI_BLS])).toEqual([{ event: CPI_BLS, relation: 'before-open', minutes: 12 }]);
    expect(projectNewsNearTrade(trade, [REAL_EARNINGS])).toEqual([]);
  });
});
