import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JournalTradeMap } from '../src/app/JournalTradeMap';
import { createTradeDomainId, parseDecimalString, type TradeId, type TradePlanId } from '../src/domain/trades';
import type { JournalHistoryEntry } from '../src/application/journal';

function dec(value: string) { const result=parseDecimalString(value); if (!result.ok) throw new Error('fixture decimal'); return result.value; }
function fixture(): JournalHistoryEntry {
  const tradeId=createTradeDomainId<TradeId>();
  return {
    trade:{ id:tradeId, symbol:'ETHUSDT', marketType:'crypto', side:'short', status:'open', source:'manual', openedAt:'2026-09-02T01:00:00.000Z', closedAt:null, createdAt:'2026-09-02T01:00:00.000Z', updatedAt:'2026-09-02T01:00:00.000Z' },
    plans:[{ id:createTradeDomainId<TradePlanId>(), tradeId, plannedEntryPrice:dec('2000.25'), plannedStopPrice:dec('2100.5'), plannedTargetPrice:dec('1800.75'), plannedQuantity:dec('2'), createdAt:'2026-09-02T00:50:00.000Z', updatedAt:'2026-09-02T00:50:00.000Z' }],
    executions:[], fees:[], metrics:null, metricsError:null,
    visualPnl:{ outcome:'unavailable', label:'Not available', amount:null, currency:null, source:'none' },
  };
}

describe('P14.5 Journal Trade Map accessible SVG shell', () => {
  it('renders a named supplementary SVG and explicitly states that it is not to scale', () => {
    render(<JournalTradeMap entry={fixture()} />);
    expect(screen.getByRole('img',{name:/ETHUSDT trade map visual/i})).toBeInTheDocument();
    expect(screen.getByText('Visual guide · Not to scale')).toBeInTheDocument();
    expect(screen.getByText('2000.25')).toBeInTheDocument();
    expect(screen.getByText('2100.5')).toBeInTheDocument();
    expect(screen.getByText('1800.75')).toBeInTheDocument();
  });
});
