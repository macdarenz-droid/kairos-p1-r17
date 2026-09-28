import { describe, expect, it } from 'vitest';
import { isAllowedOrigin, parseAllowedOrigins, UNAVAILABLE_REASONS, unavailableResponse } from '../src/http';

const APP = 'https://kairos-p1-r17.pages.dev';

describe('parseAllowedOrigins', () => {
  it('keeps only bare https origins, each once', () => {
    expect(parseAllowedOrigins(' https://kairos-p1-r17.pages.dev , https://kairos-p1-r17.pages.dev,http://x.dev,https://x.dev/path,junk')).toEqual([APP]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });
});

describe('isAllowedOrigin', () => {
  it('allows the app and its Pages previews only', () => {
    expect(isAllowedOrigin(APP, [APP])).toBe(true);
    expect(isAllowedOrigin('https://abc123.kairos-p1-r17.pages.dev', [APP])).toBe(true);
    for (const origin of [
      'https://kairos-p1-r17.pages.dev.evil.example',
      'https://evilkairos-p1-r17.pages.dev',
      'http://kairos-p1-r17.pages.dev',
      'https://a.b.kairos-p1-r17.pages.dev',
      'https://-x.kairos-p1-r17.pages.dev',
      'https://kairos-p1-r17.pages.dev:8443',
      'null',
    ]) {
      expect(isAllowedOrigin(origin, [APP]), origin).toBe(false);
    }
    expect(isAllowedOrigin(null, [APP])).toBe(false);
    expect(isAllowedOrigin('https://a.kairos.example.com', ['https://kairos.example.com'])).toBe(false);
  });
});

describe('unavailableResponse', () => {
  it('answers rate-limited with the one error shape and its headers', async () => {
    const response = unavailableResponse('rate-limited', APP, [APP]);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ apiVersion: 1, ok: false, error: 'unavailable', reason: 'rate-limited', retryAfter: 60 });
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('vary')).toBe('Origin');
    expect(response.headers.get('access-control-allow-origin')).toBe(APP);
  });

  it('adds no CORS or retry header where none applies, and allow on 405', () => {
    const notFound = unavailableResponse('not-found', null, [APP]);
    expect(notFound.headers.get('access-control-allow-origin')).toBeNull();
    expect(notFound.headers.get('retry-after')).toBeNull();
    expect(unavailableResponse('method-not-allowed', null, [APP]).headers.get('allow')).toBe('GET, OPTIONS');
  });

  it('gives every reason an error status and a null or positive whole retry wait', () => {
    for (const [reason, entry] of Object.entries(UNAVAILABLE_REASONS)) {
      expect(entry.status >= 400 && entry.status <= 599, reason).toBe(true);
      expect(entry.retryAfter === null || (Number.isInteger(entry.retryAfter) && entry.retryAfter > 0), reason).toBe(true);
    }
  });
});
