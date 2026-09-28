import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JournalTradeMap } from '../src/app/JournalTradeMap';
import { reviewTimestamp } from '../src/app/TradeReviewDetails';
import { createTradeDomainId, parseDecimalString, type TradeExecutionId, type TradeId, type TradePlanId } from '../src/domain/trades';
import type { JournalHistoryEntry } from '../src/application/journal';

function dec(value: string) { const result=parseDecimalString(value); if (!result.ok) throw new Error('fixture decimal'); return result.value; }
function fixture(status: 'open'|'closed'): JournalHistoryEntry {
  const tradeId=createTradeDomainId<TradeId>();
  return {
    trade:{ id:tradeId, symbol:'BTCUSDT', marketType:'crypto', side:'long', status, source:'manual', openedAt:'2026-09-02T01:00:00.000Z', closedAt:status==='closed'?'2026-09-02T02:00:00.000Z':null, createdAt:'2026-09-02T01:00:00.000Z', updatedAt:'2026-09-02T02:00:00.000Z' },
    plans:[{ id:createTradeDomainId<TradePlanId>(), tradeId, plannedEntryPrice:dec('100.125'), plannedStopPrice:dec('95.5'), plannedTargetPrice:dec('120.75'), plannedQuantity:dec('1'), createdAt:'2026-09-02T00:50:00.000Z', updatedAt:'2026-09-02T00:50:00.000Z' }],
    executions:status==='closed'?[{ id:createTradeDomainId<TradeExecutionId>(), tradeId, type:'exit', price:dec('118.625'), quantity:dec('1'), executedAt:'2026-09-02T02:00:00.000Z', createdAt:'2026-09-02T02:00:00.000Z' }]:[],
    fees:[], metrics:null, metricsError:null,
    visualPnl:{ outcome:'unavailable', label:'Not available', amount:null, currency:null, source:'none' },
  };
}

describe('P14.4 Journal Trade Map presentation', () => {
  it('renders exact planned facts with an accessible trade-map name and never invents an exit for an open trade', () => {
    render(<JournalTradeMap entry={fixture('open')} />);
    expect(screen.getByRole('region',{name:'BTCUSDT trade map'})).toBeInTheDocument();
    expect(screen.getByText('Long · Open')).toBeInTheDocument();
    expect(screen.getByText('100.125')).toBeInTheDocument();
    expect(screen.getByText('95.5')).toBeInTheDocument();
    expect(screen.getByText('120.75')).toBeInTheDocument();
    expect(screen.queryByText(/Actual exit/)).not.toBeInTheDocument();
  });

  it('renders authoritative executed exit facts for a closed trade without geometry or synthetic market history', () => {
    render(<JournalTradeMap entry={fixture('closed')} />);
    expect(screen.getByText('Long · Closed')).toBeInTheDocument();
    const exitValue = screen.getByText('118.625');
    expect(exitValue).toBeInTheDocument();
    expect(exitValue.parentElement?.textContent).toBe(`118.625Quantity 1 · Executed ${reviewTimestamp('2026-09-02T02:00:00.000Z')}`);
  });
});
