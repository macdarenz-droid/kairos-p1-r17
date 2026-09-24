import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SYMBOL_PICKER_MAX_RESULTS, SymbolPicker, filterSymbolPickerOptions } from '../src/features/analysis/SymbolPicker';
import type { LiveMarketUniverseInstrumentMetadataFact } from '../src/services/market-data/liveMarketUniverseInstrumentMetadataFact';

const fact = (baseAsset: string, quoteAsset: string): LiveMarketUniverseInstrumentMetadataFact => ({
  instrument: { venue: 'binance-spot', symbol: `${baseAsset}${quoteAsset}` }, baseAsset, quoteAsset, tradingEnabled: true,
});
const facts = [fact('ETH', 'BTC'), fact('SOL', 'USDT'), fact('BTC', 'FDUSD'), fact('BTC', 'USDT'), fact('ETH', 'USDT')];
const symbols = (list: readonly LiveMarketUniverseInstrumentMetadataFact[]) => list.map(item => item.instrument.symbol);

afterEach(() => { cleanup(); });

describe('filterSymbolPickerOptions', () => {
  it('orders USDT pairs A→Z first, then the others A→Z', () => {
    expect(symbols(filterSymbolPickerOptions(facts, ''))).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BTCFDUSD', 'ETHBTC']);
  });

  it('filters by symbol or base/quote, ignoring case and separators', () => {
    expect(symbols(filterSymbolPickerOptions(facts, 'eth'))).toEqual(['ETHUSDT', 'ETHBTC']);
    expect(symbols(filterSymbolPickerOptions(facts, 'btc/usdt'))).toEqual(['BTCUSDT']);
    expect(symbols(filterSymbolPickerOptions(facts, 'xyz'))).toEqual([]);
  });

  it('returns at most 50 results', () => {
    const many = Array.from({ length: 120 }, (_, index) => fact(`A${String(index).padStart(3, '0')}`, 'USDT'));
    const result = filterSymbolPickerOptions(many, '');
    expect(result).toHaveLength(SYMBOL_PICKER_MAX_RESULTS);
    expect(result[0].instrument.symbol).toBe('A000USDT');
  });
});

describe('SymbolPicker', () => {
  it('is a labelled combobox whose list follows typing and whose choice reports the symbol', () => {
    const onChange = vi.fn();
    render(<SymbolPicker facts={facts} value="" onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Chart symbol' });
    fireEvent.focus(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    fireEvent.change(input, { target: { value: 'sol' } });
    const list = screen.getByRole('listbox', { name: 'Symbols' });
    expect(within(list).getAllByRole('option').map(option => option.textContent)).toEqual(['SOLUSDT · SOL/USDT']);
    fireEvent.click(within(list).getByRole('option', { name: /^SOLUSDT/ }));
    expect(onChange).toHaveBeenCalledWith('SOLUSDT');
  });

  it('moves the active option with the arrow keys and chooses it with Enter', () => {
    const onChange = vi.fn();
    render(<SymbolPicker facts={facts} value="" onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Chart symbol' });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const active = document.getElementById(input.getAttribute('aria-activedescendant')!);
    expect(active).toHaveTextContent('ETHUSDT · ETH/USDT');
    expect(active).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('ETHUSDT');
  });

  it('shows the chosen symbol and says when nothing matches', () => {
    render(<SymbolPicker facts={facts} value="BTCUSDT" onChange={() => undefined} />);
    const input = screen.getByRole('combobox', { name: 'Chart symbol' });
    expect(input).toHaveValue('BTCUSDT');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'nothing' } });
    expect(screen.getByText('No symbol matches.')).toBeTruthy();
  });
});
