import { describe, expect, it } from 'vitest';
import { CRASH_EVENTS, CRASH_STACK_LINES, describeCrash } from '../src/diagnostics/crashDetails';
import type { DiagnosticEvent } from '../src/diagnostics/DiagnosticsService';
import { buildInfo } from '../src/shared/config/buildInfo';

const now = () => '2026-10-24T01:00:00.000Z';
const event = (index: number, context?: Record<string, unknown>): DiagnosticEvent => ({
  timestamp: `2026-10-24T00:${String(index).padStart(2, '0')}:00.000Z`, level: 'info', category: 'app', event: `event_${index}`, context, appVersion: buildInfo.appVersion, buildId: buildInfo.buildId,
});

describe('T-054e the crash details', () => {
  it('holds the version, the time, the error, where, and what happened just before', () => {
    const text = describeCrash(new TypeError('x is undefined'), '\n    at TradeCard\n    at JournalRoute\n', { now, events: [event(1), event(2, { schemaVersion: 12, errorName: 'VersionError' })] });
    expect(text.split('\n')).toEqual([
      `Kairos ${buildInfo.appVersion} · build ${buildInfo.buildId}`,
      'Time: 2026-10-24T01:00:00.000Z',
      'Error: TypeError: x is undefined',
      '',
      'Where (first 20 lines):',
      'at TradeCard',
      'at JournalRoute',
      '',
      'Last 20 events:',
      '2026-10-24T00:01:00.000Z info app event_1',
      '2026-10-24T00:02:00.000Z info app event_2 errorName=VersionError schemaVersion=12',
    ]);
  });

  it('keeps the first 20 lines of where and the last 20 events', () => {
    const stack = Array.from({ length: 30 }, (_, index) => `at Component${index}`).join('\n');
    const events = Array.from({ length: 35 }, (_, index) => event(index));
    const lines = describeCrash(new Error('boom'), stack, { now, events }).split('\n');
    expect(lines.filter(line => line.startsWith('at Component'))).toHaveLength(CRASH_STACK_LINES);
    expect(lines).toContain('at Component19');
    expect(lines).not.toContain('at Component20');
    expect(lines.filter(line => / event_\d+/.test(line))).toHaveLength(CRASH_EVENTS);
    expect(lines.some(line => line.endsWith(' event_14'))).toBe(false);
    expect(lines.some(line => line.endsWith(' event_15'))).toBe(true);
  });

  it('never holds journal data, even when an event\'s context has it, nor messages or stacks of past events', () => {
    const text = describeCrash(new Error('boom'), null, { now, events: [
      event(1, { symbol: 'BTCUSDT', price: '64000.5', note: 'my plan', message: 'Trade BTCUSDT failed', errorMessage: 'at 64000.5', stack: 'Error at /src/app/x.ts', componentStack: 'at TradeCard', name: 'Error' }),
    ] });
    for (const secret of ['BTCUSDT', '64000.5', 'my plan', '/src/app/x.ts', 'TradeCard']) expect(text).not.toContain(secret);
    expect(text).toContain('event_1 name=Error');
    expect(text).toContain('Where (first 20 lines):\n(not known)');
  });

  it('describes a thrown value that is not an Error, and a page error, without their contents', () => {
    expect(describeCrash({ symbol: 'ETHUSDT' }, null, { now, events: [] })).toContain('Error: A object value was thrown, not an Error.');
    expect(describeCrash({ symbol: 'ETHUSDT' }, null, { now, events: [] })).not.toContain('ETHUSDT');
    expect(describeCrash({ status: 404, statusText: 'Not Found', data: 'ETHUSDT' }, null, { now, events: [] })).toContain('Error: Page error: 404 Not Found');
    expect(describeCrash('a string', null, { now, events: [] })).toContain('Last 20 events:\n(none)');
  });
});
