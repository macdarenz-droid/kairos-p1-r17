import { describe, expect, it } from 'vitest';
import { checkUserRiskBoxStop, constructUserRiskBox, moveUserRiskBoxHandle, type UserRiskBoxPoint } from '../src/application/risk-reward';
import type { DecimalString } from '../src/domain/trades';

const at = (time: string, price: string): UserRiskBoxPoint => ({ timestamp: `2026-09-12T${time}:00.000Z`, price: price as DecimalString });
const longBox = () => {
  const result = constructUserRiskBox('box-1', at('10:00', '100'), at('10:25', '95'), at('10:30', '110'));
  if (!result.ok) throw new Error(result.reason);
  return result.box;
};

describe('user risk box', () => {
  it('builds a long box from entry, stop and target taps', () => {
    expect(longBox()).toEqual({
      analysis: { id: 'box-1', side: 'long', levels: { entry: '100', stop: '95', target: '110' } },
      extent: { start: '2026-09-12T10:00:00.000Z', end: '2026-09-12T10:25:00.000Z' },
    });
  });

  it('builds a short box when the stop is above the entry', () => {
    const result = constructUserRiskBox('box-2', at('10:00', '100'), at('10:25', '104'), at('10:30', '92'));
    expect(result).toMatchObject({ ok: true, box: { analysis: { side: 'short' } } });
  });

  it('spans from the earliest to the latest tap when the stop is earlier in time', () => {
    const result = constructUserRiskBox('box-3', at('10:25', '100'), at('10:00', '95'), at('10:30', '110'));
    expect(result).toMatchObject({ ok: true, box: { extent: { start: '2026-09-12T10:00:00.000Z', end: '2026-09-12T10:25:00.000Z' } } });
  });

  it.each([
    ['a stop at the entry price', at('10:00', '100'), at('10:25', '100'), at('10:30', '110'), 'zero-risk-distance'],
    ['the same time for entry and stop', at('10:00', '100'), at('10:00', '95'), at('10:30', '110'), 'no-width'],
    ['a target on the stop side', at('10:00', '100'), at('10:25', '95'), at('10:30', '90'), 'levels-not-ordered'],
    ['an unreadable time', { timestamp: 'later', price: '100' as DecimalString }, at('10:25', '95'), at('10:30', '110'), 'invalid-time'],
  ] as const)('refuses %s', (_label, entry, stop, target, reason) => {
    expect(constructUserRiskBox('box', entry, stop, target)).toEqual({ ok: false, reason });
  });

  it('checks a stop tap on its own', () => {
    expect(checkUserRiskBoxStop(at('10:00', '100'), at('10:05', '95'))).toEqual({ ok: true, side: 'long' });
    expect(checkUserRiskBoxStop(at('10:00', '100'), at('10:05', 'abc' as never))).toEqual({ ok: false, reason: 'invalid-decimal' });
  });

  it('moves handles without flipping the box', () => {
    const box = longBox();
    expect(moveUserRiskBoxHandle(box, 'start', at('10:00', '101'))).toMatchObject({ ok: true, box: { analysis: { id: 'box-1', side: 'long', levels: { entry: '101' } } } });
    expect(moveUserRiskBoxHandle(box, 'start', at('10:00', '120'))).toEqual({ ok: false, reason: 'levels-not-ordered' });
    expect(moveUserRiskBoxHandle(box, 'start', at('10:40', '100'))).toEqual({ ok: false, reason: 'no-width' });
    expect(moveUserRiskBoxHandle(box, 'end', at('10:40', '94'))).toEqual({ ok: true, box: {
      analysis: { id: 'box-1', side: 'long', levels: { entry: '100', stop: '94', target: '110' } },
      extent: { start: '2026-09-12T10:00:00.000Z', end: '2026-09-12T10:40:00.000Z' },
    } });
    expect(moveUserRiskBoxHandle(box, 'target', at('10:50', '115'))).toMatchObject({ ok: true, box: { analysis: { id: 'box-1', side: 'long', levels: { target: '115' } }, extent: { end: '2026-09-12T10:50:00.000Z' } } });
    expect(box).toEqual(longBox());
  });
});
