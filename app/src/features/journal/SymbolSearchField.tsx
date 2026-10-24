import { useMemo, useState, type KeyboardEvent } from 'react';
import { searchMarketSymbols, type CryptoMarketOption, type SymbolSearchRow } from '../../application/market-reference/symbolSearch';
import type { MarketType } from '../../domain/trades';
import type { FieldControlProps } from '../../design-system/primitives/Field';

interface Props {
  readonly control: FieldControlProps;
  readonly value: string;
  readonly marketType: MarketType | '';
  /** Binance's list when it has been read; forex pairs need no list. */
  readonly markets: readonly CryptoMarketOption[] | null;
  /** False without a market provider: a plain text field, as before U14. */
  readonly searchable: boolean;
  readonly onType: (text: string) => void;
  readonly onChoose: (row: SymbolSearchRow) => void;
}

/**
 * U14 (D254): the trade form's "Symbol": type to search Binance's markets and the forex pairs, arrows to move, Enter
 * or tap to choose. Typing alone still works; a symbol that is not on a list can be saved.
 */
export function SymbolSearchField({ control, value, marketType, markets, searchable, onType, onChoose }: Props) {
  const listId = `${control.id}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rows = useMemo(() => (searchable && open ? searchMarketSymbols(value, { marketType, crypto: markets ?? [] }) : []), [searchable, open, value, marketType, markets]);
  const expanded = rows.length > 0;
  const activeIndex = Math.min(active, rows.length - 1);
  const choose = (row: SymbolSearchRow) => { onChoose(row); setOpen(false); };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!searchable) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(open ? Math.min(activeIndex + 1, rows.length - 1) : 0); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(Math.max(activeIndex - 1, 0)); }
    else if (event.key === 'Enter' && expanded) { event.preventDefault(); choose(rows[activeIndex]!); }
    else if (event.key === 'Escape' && expanded) { event.preventDefault(); setOpen(false); }
  };
  const common = {
    ...control, name: 'symbol', value, autoCapitalize: 'characters', autoComplete: 'off', spellCheck: false,
    onChange: (event: { target: { value: string } }) => { onType(event.target.value); setActive(0); setOpen(true); },
  } as const;
  if (!searchable) return <input {...common} placeholder="BTCUSD" />;
  return <div className="kairos-symbol-search">
    <input {...common} type="text" role="combobox" aria-autocomplete="list" aria-controls={listId} aria-expanded={expanded}
      aria-activedescendant={expanded ? `${listId}-${activeIndex}` : undefined} placeholder="Search, e.g. BTC or EURUSD"
      onKeyDown={onKeyDown} onBlur={() => setOpen(false)} />
    <ul id={listId} role="listbox" aria-label="Search results" className="kairos-symbol-search__list" hidden={!expanded}>
      {rows.map((row, index) => <li key={`${row.marketType}-${row.symbol}`} id={`${listId}-${index}`} role="option" aria-selected={index === activeIndex}
        className="kairos-symbol-search__option" onMouseDown={event => event.preventDefault()} onClick={() => choose(row)}>{row.label}</li>)}
    </ul>
  </div>;
}
