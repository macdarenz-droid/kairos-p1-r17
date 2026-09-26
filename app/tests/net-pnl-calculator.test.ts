import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import { calculateNetPnl } from '../src/domain/calculations';

const decimal = (value: string) => value as DecimalString;

describe('P11.16 net P&L primitive', () => {
  it('subtracts authoritative fees from authoritative gross profit', () => {
    expect(calculateNetPnl(decimal('100'), decimal('4'))).toEqual({
      ok: true,
      netPnl: '96',
    });
  });

  it('uses exact decimal arithmetic', () => {
    expect(calculateNetPnl(decimal('0.3'), decimal('0.1'))).toEqual({
      ok: true,
      netPnl: '0.2',
    });
  });

  it('preserves loss semantics by making fees increase the loss', () => {
    expect(calculateNetPnl(decimal('-50'), decimal('2.5'))).toEqual({
      ok: true,
      netPnl: '-52.5',
    });
  });

  it('allows fees to turn a small gross profit into a net loss', () => {
    expect(calculateNetPnl(decimal('2'), decimal('3'))).toEqual({
      ok: true,
      netPnl: '-1',
    });
  });

  it('preserves gross P&L when authoritative fees are zero', () => {
    expect(calculateNetPnl(decimal('25.5'), decimal('0'))).toEqual({
      ok: true,
      netPnl: '25.5',
    });
  });

  it('rejects malformed gross P&L explicitly', () => {
    expect(calculateNetPnl('bad-gross' as DecimalString, decimal('1'))).toEqual({
      ok: false,
      reason: 'invalid-decimal',
    });
  });

  it('rejects malformed fee totals explicitly', () => {
    expect(calculateNetPnl(decimal('10'), 'bad-fee' as DecimalString)).toEqual({
      ok: false,
      reason: 'invalid-decimal',
    });
  });
});
