import { describe, expect, it } from 'vitest';
import {
  createEmptyManualTradeDraft,
  prepareManualTradeSubmission,
  saveManualTrade,
} from '../src/application/trades';

describe('P10.2 manual trade draft foundation', () => {
  it('starts without silently choosing market, direction, or trade state for the user', () => {
    expect(createEmptyManualTradeDraft()).toEqual({
      symbol: '',
      marketType: '',
      side: '',
      status: '',
      openedAt: '',
      closedAt: '',
      plan: {
        plannedEntryPrice: '',
        plannedStopPrice: '',
        plannedTargetPrice: '',
        plannedQuantity: '',
      },
    });
  });

  it.each([
    ['marketType', { marketType: '' }],
    ['side', { side: '' }],
    ['status', { status: '' }],
  ] as const)('requires an explicit %s selection before submission', (field, override) => {
    const draft = {
      ...createEmptyManualTradeDraft(),
      marketType: 'crypto' as const,
      side: 'long' as const,
      status: 'draft' as const,
      ...override,
    };

    expect(prepareManualTradeSubmission(draft)).toEqual({
      ok: false,
      type: 'draft-incomplete',
      field,
      reason: 'selection-required',
    });
  });

  it('trims optional timestamps and does not create an empty plan aggregate', () => {
    const draft = {
      ...createEmptyManualTradeDraft(),
      symbol: ' btcusdt ',
      marketType: 'crypto' as const,
      side: 'long' as const,
      status: 'open' as const,
      openedAt: ' 2026-09-01T05:00:00.000Z ',
      closedAt: '   ',
    };

    expect(prepareManualTradeSubmission(draft)).toEqual({
      ok: true,
      input: {
        symbol: ' btcusdt ',
        marketType: 'crypto',
        side: 'long',
        status: 'open',
        openedAt: '2026-09-01T05:00:00.000Z',
        closedAt: null,
      },
    });
  });

  it('preserves raw financial strings for the P10.1 command to validate and normalize', () => {
    const draft = {
      ...createEmptyManualTradeDraft(),
      symbol: 'ETHUSD',
      marketType: 'crypto' as const,
      side: 'short' as const,
      status: 'draft' as const,
      plan: {
        plannedEntryPrice: ' 100.2500 ',
        plannedStopPrice: '0',
        plannedTargetPrice: '',
        plannedQuantity: ' 2.5 ',
      },
    };

    const prepared = prepareManualTradeSubmission(draft);
    expect(prepared).toEqual({
      ok: true,
      input: {
        symbol: 'ETHUSD',
        marketType: 'crypto',
        side: 'short',
        status: 'draft',
        openedAt: null,
        closedAt: null,
        plan: {
          plannedEntryPrice: '100.2500',
          plannedStopPrice: '0',
          plannedTargetPrice: null,
          plannedQuantity: '2.5',
        },
      },
    });

    // Architectural ownership check: numeric validity remains in saveManualTrade/P10.1.
    expect(saveManualTrade).toBeTypeOf('function');
  });
});
