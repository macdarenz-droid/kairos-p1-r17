import { describe, expect, it } from 'vitest';
import { createZonedClock, fnv1a64Hex, normaliseNewsText, readIcsEvents } from '../src/news/newsParsing';

describe('normaliseNewsText', () => {
  it('keeps plain text only: entities decoded once, no markup, no control characters', () => {
    expect(normaliseNewsText(' <![CDATA[ A &amp; B ]]> ', 200)).toBe('A & B');
    expect(normaliseNewsText('&lt;img src=x onerror=alert(1)&gt; Rates', 200)).toBe('Rates');
    expect(normaliseNewsText('&amp;lt;b&amp;gt;', 200)).toBe('&lt;b&gt;');
    expect(normaliseNewsText('a\u0007b', 200)).toBe('a b');
    expect(normaliseNewsText('&#x1F4C8; up &#55296; &copy;', 200)).toBe('📈 up &copy;');
    expect(normaliseNewsText('  ', 200)).toBeNull();
    expect(normaliseNewsText('x'.repeat(201), 200)).toBeNull();
    expect(normaliseNewsText('x'.repeat(200), 200)).toBe('x'.repeat(200));
    expect(normaliseNewsText(42, 200)).toBeNull();
  });
});

describe('readIcsEvents', () => {
  it('reads each event summary and start, unfolded and unescaped', () => {
    const text = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY;LANGUAGE=en:A\\, B\; C\\\\ D\\nE\r\n  folded\r\nDTSTART;TZID=US-Eastern: 20261014T083000 \r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART:20261029T123000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
    expect(readIcsEvents(text)).toEqual([
      { summary: 'A, B; C\\ D E folded', dtstart: { params: ';TZID=US-Eastern', value: '20261014T083000' } },
      { summary: null, dtstart: { params: '', value: '20261029T123000Z' } },
    ]);
    expect(readIcsEvents('<!doctype html><title>Calendar</title>')).toBeNull();
  });
});

describe('createZonedClock (workerd time zone data)', () => {
  it('turns a wall time into the UTC instant, across clock changes', () => {
    const newYork = createZonedClock('America/New_York');
    expect(newYork('2026-10-14', '08:30')).toBe('2026-10-14T12:30:00.000Z');
    expect(newYork('2026-11-06', '08:30')).toBe('2026-11-06T13:30:00.000Z');
    expect(newYork('2026-03-08', '02:30')).toBeNull();
    expect(newYork('2026-02-30', '10:00')).toBeNull();
    expect(newYork('2026-10-14', '24:00')).toBeNull();
    const luxembourg = createZonedClock('Europe/Luxembourg');
    expect(luxembourg('2026-10-02', '11:00')).toBe('2026-10-02T09:00:00.000Z');
    expect(luxembourg('2026-11-03', '11:00')).toBe('2026-11-03T10:00:00.000Z');
    expect(createZonedClock('Not/AZone')('2026-10-02', '11:00')).toBeNull();
  });
});

describe('fnv1a64Hex', () => {
  it('matches the FNV-1a 64-bit vectors', () => {
    expect(fnv1a64Hex('')).toBe('cbf29ce484222325');
    expect(fnv1a64Hex('a')).toBe('af63dc4c8601ec8c');
  });
});
