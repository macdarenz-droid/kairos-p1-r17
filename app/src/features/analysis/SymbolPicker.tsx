import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import type { LiveMarketUniverseInstrumentMetadataFact } from '../../services/market-data/liveMarketUniverseInstrumentMetadataFact';

export const SYMBOL_PICKER_MAX_RESULTS = 50;

/** USDT pairs A→Z first, then every other pair A→Z; at most 50, filtered by symbol or base/quote. */
export function filterSymbolPickerOptions(
  facts: readonly LiveMarketUniverseInstrumentMetadataFact[],
  query: string,
): readonly LiveMarketUniverseInstrumentMetadataFact[] {
  const needle = query.replace(/[/\-\s]/g, '').toUpperCase();
  const matches = facts.filter(fact => needle === '' || fact.instrument.symbol.toUpperCase().includes(needle) || `${fact.baseAsset}${fact.quoteAsset}`.toUpperCase().includes(needle));
  const bySymbol = (a: LiveMarketUniverseInstrumentMetadataFact, b: LiveMarketUniverseInstrumentMetadataFact) => a.instrument.symbol.localeCompare(b.instrument.symbol);
  const usdt = matches.filter(fact => fact.quoteAsset === 'USDT').sort(bySymbol);
  const others = matches.filter(fact => fact.quoteAsset !== 'USDT').sort(bySymbol);
  return [...usdt, ...others].slice(0, SYMBOL_PICKER_MAX_RESULTS);
}

const optionLabel = (fact: LiveMarketUniverseInstrumentMetadataFact) => `${fact.instrument.symbol} · ${fact.baseAsset}/${fact.quoteAsset}`;

/** Searchable "Chart symbol" combobox: type to filter, arrows to move, Enter or tap to choose. */
export function SymbolPicker({ facts, value, onChange, disabled = false }: {
  readonly facts: readonly LiveMarketUniverseInstrumentMetadataFact[];
  readonly value: string;
  readonly onChange: (symbol: string) => void;
  readonly disabled?: boolean;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const options = useMemo(() => filterSymbolPickerOptions(facts, query ?? ''), [facts, query]);
  const activeIndex = Math.min(active, options.length - 1);
  const choose = (fact: LiveMarketUniverseInstrumentMetadataFact) => {
    onChange(fact.instrument.symbol);
    setQuery(null);
    setOpen(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(Math.min(activeIndex + 1, options.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(Math.max(activeIndex - 1, 0)); }
    else if (event.key === 'Enter' && open && activeIndex >= 0) { event.preventDefault(); choose(options[activeIndex]); }
    else if (event.key === 'Escape') { setOpen(false); setQuery(null); }
  };
  const expanded = open && !disabled;
  return <div className="kairos-symbol-picker">
    <label htmlFor={`${id}-input`}>Chart symbol</label>
    <input
      id={`${id}-input`}
      type="text"
      role="combobox"
      aria-autocomplete="list"
      aria-controls={listId}
      aria-expanded={expanded}
      aria-activedescendant={expanded && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
      autoComplete="off"
      spellCheck={false}
      placeholder="Search symbol, e.g. BTC"
      disabled={disabled}
      value={query ?? value}
      onFocus={() => setOpen(true)}
      onBlur={() => { setOpen(false); setQuery(null); }}
      onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }}
      onKeyDown={onKeyDown}
    />
    <ul id={listId} role="listbox" aria-label="Symbols" className="kairos-symbol-picker__list" hidden={!expanded}>
      {expanded ? options.map((fact, index) => <li
        key={fact.instrument.symbol}
        id={`${id}-option-${index}`}
        role="option"
        aria-selected={index === activeIndex}
        className="kairos-symbol-picker__option"
        onMouseDown={event => event.preventDefault()}
        onClick={() => choose(fact)}
      >{optionLabel(fact)}</li>) : null}
    </ul>
    {expanded && options.length === 0 ? <p className="kairos-symbol-picker__empty" role="status">No symbol matches.</p> : null}
  </div>;
}
