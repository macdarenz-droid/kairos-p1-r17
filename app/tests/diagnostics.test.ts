import { describe, expect, it } from 'vitest';
import { buildInfo } from '../src/shared/config/buildInfo';
import { describeThrownValue, DiagnosticsService } from '../src/diagnostics/DiagnosticsService';

describe('describeThrownValue', () => {
  it('normalizes Error instances', () => {
    expect(describeThrownValue(new TypeError('bad value'))).toMatchObject({
      name: 'TypeError',
      message: 'bad value',
    });
  });

  it('normalizes non-Error thrown values without throwing', () => {
    expect(describeThrownValue('plain failure')).toEqual({
      name: 'NonErrorThrownValue',
      message: 'plain failure',
      valueType: 'string',
    });
    expect(describeThrownValue(null)).toEqual({
      name: 'NonErrorThrownValue',
      message: 'A non-Error value was thrown.',
      valueType: 'null',
    });
  });
});

describe('DiagnosticsService', () => {
  it('keeps a bounded ring buffer', () => {
    const service = new DiagnosticsService(2);
    for (let i = 0; i < 3; i += 1) service.record({ level: 'info', category: 'app', event: `event-${i}` });
    expect(service.snapshot().map((event) => event.event)).toEqual(['event-1', 'event-2']);
  });

  it('returns a defensive snapshot', () => {
    const service = new DiagnosticsService();
    service.record({ level: 'info', category: 'app', event: 'safe', context: { value: 1 } });
    const first = service.snapshot() as unknown as Array<{ event: string; context?: Record<string, unknown> }>;
    first[0].event = 'changed';
    if (first[0].context) first[0].context.value = 2;
    expect(service.snapshot()[0].event).toBe('safe');
    expect(service.snapshot()[0].context?.value).toBe(1);
  });

  it('isolates nested context from later input and snapshot mutation', () => {
    const service = new DiagnosticsService();
    const context = { nested: { values: [1, 2] } };
    service.record({ level: 'info', category: 'app', event: 'nested', context });

    context.nested.values.push(3);
    const first = service.snapshot();
    const firstNested = first[0].context?.nested as { values: number[] };
    firstNested.values.push(4);

    const secondNested = service.snapshot()[0].context?.nested as { values: number[] };
    expect(secondNested.values).toEqual([1, 2]);
  });

  it('keeps diagnostics non-throwing when context contains an unsupported clone value', () => {
    const service = new DiagnosticsService();
    expect(() => service.record({
      level: 'error',
      category: 'app',
      event: 'unsupported-context',
      context: { callback: () => undefined },
    })).not.toThrow();

    expect(service.snapshot()[0].context).toEqual({
      diagnosticsContext: 'Context unavailable because it contains an unsupported value.',
    });
  });

  it('attaches app/build metadata to every event', () => {
    const service = new DiagnosticsService();
    service.record({ level: 'info', category: 'app', event: 'metadata' });
    expect(service.snapshot()[0]).toMatchObject({
      appVersion: buildInfo.appVersion,
      buildId: buildInfo.buildId,
    });
  });

  it('rejects invalid buffer capacities', () => {
    expect(() => new DiagnosticsService(0)).toThrow('Diagnostics capacity must be a positive integer.');
    expect(() => new DiagnosticsService(1.5)).toThrow('Diagnostics capacity must be a positive integer.');
  });
});
