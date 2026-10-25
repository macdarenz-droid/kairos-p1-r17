import { useEffect, useRef, useState } from 'react';
import { loadDisciplineLists } from '../../application/discipline/disciplineListsPreference';
import { loadStrategies } from '../../application/discipline/strategies';
import {
  describeJournalTotals, hasJournalFilters, journalSearchAsRead, loadJournalTotals, NO_JOURNAL_FILTERS, writeJournalFilters,
  type JournalFilters, type JournalHistoryScope, type JournalTotals,
} from '../../application/journal';
import { loadVisualPnlTimeZone } from '../../application/visual-pnl';
import type { KairosDatabase } from '../../data/database';
import { Button, Field, Select, Sheet } from '../../design-system/primitives';
import './journalFilterBar.css';

/** The trader's time zone for the From and To days (D262): the saved one, else this device's. Undefined while it is read. */
export function useJournalTimeZone(db: KairosDatabase): string | undefined {
  const [zone, setZone] = useState<string | undefined>(undefined);
  useEffect(() => {
    let active = true;
    const device = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
    loadVisualPnlTimeZone(db).then(saved => { if (active) setZone(saved ?? device()); }, () => { if (active) setZone(device()); });
    return () => { active = false; };
  }, [db]);
  return zone;
}

const STATUS_WORDS = { draft: 'Planned', open: 'Open', closed: 'Closed', cancelled: 'Cancelled' } as const;
const MARKET_WORDS = { stock: 'Stocks', forex: 'Forex', crypto: 'Crypto', futures: 'Futures', options: 'Options', other: 'Other' } as const;
const SIDE_WORDS = { long: 'Long', short: 'Short' } as const;
const RESULT_WORDS = { won: 'Won', lost: 'Lost', even: 'Even' } as const;
const MADE_WORDS = { paper: 'Made by hand', replay: 'Made in Replay' } as const;
const options = <K extends string>(words: Readonly<Record<K, string>>) => (Object.keys(words) as K[]).map(value => ({ value, label: words[value] }));

/** A day the address holds (YYYY-MM-DD) in words: "1 Mar 2026". */
function dayWords(value: string): string {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`));
}

type Named = Readonly<{ id: string; name: string }>;
type Chip = Readonly<{ key: keyof JournalFilters; label: string }>;

/** Each set filter in words, in the address's order. A strategy or mistake no longer in your lists shows its id. */
function chipsOf(filters: JournalFilters, strategies: readonly Named[], mistakes: readonly Named[]): readonly Chip[] {
  const chips: Chip[] = [];
  const nameOf = (list: readonly Named[], id: string) => list.find(item => item.id === id)?.name ?? id;
  if (filters.q !== null) chips.push({ key: 'q', label: `Symbol: ${filters.q}` });
  if (filters.status !== null) chips.push({ key: 'status', label: `Status: ${STATUS_WORDS[filters.status]}` });
  if (filters.from !== null) chips.push({ key: 'from', label: `From ${dayWords(filters.from)}` });
  if (filters.to !== null) chips.push({ key: 'to', label: `To ${dayWords(filters.to)}` });
  if (filters.market !== null) chips.push({ key: 'market', label: `Market: ${MARKET_WORDS[filters.market]}` });
  if (filters.side !== null) chips.push({ key: 'side', label: SIDE_WORDS[filters.side] });
  if (filters.result !== null) chips.push({ key: 'result', label: RESULT_WORDS[filters.result] });
  if (filters.strategy !== null) chips.push({ key: 'strategy', label: `Strategy: ${nameOf(strategies, filters.strategy)}` });
  if (filters.mistake !== null) chips.push({ key: 'mistake', label: `Mistake: ${nameOf(mistakes, filters.mistake)}` });
  if (filters.source !== null) chips.push({ key: 'source', label: MADE_WORDS[filters.source] });
  return chips;
}

type Totals = Readonly<{ kind: 'counting' }> | Readonly<{ kind: 'ready'; totals: JournalTotals }> | Readonly<{ kind: 'failed' }>;
/** The search is sent to the address once typing pauses. */
const SEARCH_PAUSE_MS = 300;

/**
 * U15 (D262): above the Journal's or Practice's list: the symbol search; "Filters", a sheet with the dates, market, Long
 * or Short, result, strategy, mistake (and in Practice how it was made); each set filter as a chip with "Remove"; "Clear
 * filters"; and, while any filter is set, what every matching trade adds up to. Each change replaces the address's
 * filters (`onChange`); focus stays on the control changed, and a chip's "Remove" hands focus to the next one.
 */
export function JournalFilterBar({ db, scope, filters, onChange, timeZone, refreshRevision = 0 }: {
  readonly db: KairosDatabase;
  readonly scope: JournalHistoryScope;
  readonly filters: JournalFilters;
  readonly onChange: (next: JournalFilters) => void;
  readonly timeZone: string | undefined;
  /** Bumped when a trade was saved or changed: the totals count again. */
  readonly refreshRevision?: number;
}) {
  const idPrefix = scope === 'practice' ? 'kairos-practice-filter' : 'kairos-journal-filter';
  const [sheetOpen, setSheetOpen] = useState(false);
  const [strategies, setStrategies] = useState<readonly Named[]>([]);
  const [mistakes, setMistakes] = useState<readonly Named[]>([]);
  useEffect(() => {
    let active = true;
    void Promise.all([loadStrategies(db), loadDisciplineLists(db)]).then(([read, lists]) => {
      if (!active) return;
      if (read.ok) setStrategies(read.strategies.map(strategy => ({ id: strategy.id, name: strategy.name })));
      if (lists.ok) setMistakes(lists.lists.mistakes.map(item => ({ id: item.id, name: item.label })));
    });
    return () => { active = false; };
  }, [db]);

  // The search as typed; the address hears it once typing pauses, and a change made elsewhere (Clear, Back) shows here.
  // The address keeps it trimmed, so what was sent is compared as the address reads it: a typed space stays in the box.
  const [search, setSearch] = useState(filters.q ?? '');
  const sentSearch = useRef(filters.q ?? '');
  useEffect(() => {
    if ((filters.q ?? null) === journalSearchAsRead(sentSearch.current)) return;
    sentSearch.current = filters.q ?? '';
    setSearch(filters.q ?? '');
  }, [filters.q]);
  // The pause ends after later renders: it sends with this render's filters and address, never the ones it began with.
  const latest = useRef({ filters, onChange });
  latest.current = { filters, onChange };
  useEffect(() => {
    if (search === sentSearch.current) return;
    const timer = window.setTimeout(() => {
      sentSearch.current = search;
      latest.current.onChange({ ...latest.current.filters, q: journalSearchAsRead(search) });
    }, SEARCH_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const set = <K extends keyof JournalFilters>(key: K, value: JournalFilters[K]) => onChange({ ...filters, [key]: value });
  const pick = <K extends keyof JournalFilters>(key: K) => (value: string) => set(key, (value === '' ? null : value) as JournalFilters[K]);

  const filtered = hasJournalFilters(filters);
  const filterKey = writeJournalFilters(filters).toString();
  const byDays = filters.from !== null || filters.to !== null;
  const [totals, setTotals] = useState<Totals>({ kind: 'counting' });
  useEffect(() => {
    if (!filtered || (byDays && timeZone === undefined)) return;
    let active = true;
    setTotals({ kind: 'counting' });
    loadJournalTotals(db, scope, filters, timeZone ?? 'UTC').then(
      read => { if (active) setTotals({ kind: 'ready', totals: read }); },
      () => { if (active) setTotals({ kind: 'failed' }); },
    );
    return () => { active = false; };
  }, [db, scope, filterKey, byDays ? timeZone : null, refreshRevision]); // eslint-disable-line react-hooks/exhaustive-deps

  const chips = chipsOf(filters, strategies, mistakes);
  const chipList = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const filtersButton = useRef<HTMLButtonElement>(null);
  // A chip's "Remove" goes with its chip: focus moves to the next chip's (else the one before), else to "Filters".
  const focusChipAt = useRef<number | null>(null);
  useEffect(() => {
    const index = focusChipAt.current;
    if (index === null) return;
    focusChipAt.current = null;
    const buttons = chipList.current?.querySelectorAll<HTMLButtonElement>('button') ?? [];
    (buttons[Math.min(index, buttons.length - 1)] ?? filtersButton.current)?.focus();
  }, [filterKey]);
  const remove = (key: keyof JournalFilters, index: number) => {
    focusChipAt.current = index;
    if (key === 'q') { sentSearch.current = ''; setSearch(''); }
    set(key, null);
  };
  const clear = () => {
    sentSearch.current = '';
    setSearch('');
    onChange(NO_JOURNAL_FILTERS);
    searchInput.current?.focus();
  };
  const sheetCount = chips.filter(chip => chip.key !== 'q' && chip.key !== 'status').length;

  return <div className="kairos-filter-bar">
    <div className="kairos-filter-bar__row">
      <Field label="Search symbols" id={`${idPrefix}-search`} className="kairos-filter-bar__search">
        {control => <input {...control} ref={searchInput} type="search" name="q" value={search} autoComplete="off" spellCheck={false}
          onChange={event => setSearch(event.target.value)} />}
      </Field>
      <Button ref={filtersButton} variant="secondary" size="sm" aria-haspopup="dialog" onClick={() => setSheetOpen(true)}>
        {sheetCount > 0 ? `Filters · ${sheetCount}` : 'Filters'}
      </Button>
    </div>
    {chips.length > 0 ? <div className="kairos-filter-bar__chips">
      {/* A group, not a list: the page's lists are its trades. */}
      <div ref={chipList} role="group" aria-label="Filters in use" className="kairos-filter-bar__chip-group">
        {chips.map((chip, index) => <span key={chip.key} className="kairos-filter-bar__chip">
          <span>{chip.label}</span>
          <Button variant="ghost" size="sm" aria-label={`Remove ${chip.label}`} onClick={() => remove(chip.key, index)}>Remove</Button>
        </span>)}
      </div>
      <Button variant="ghost" size="sm" onClick={clear}>Clear filters</Button>
    </div> : null}
    {filtered ? <p className="kairos-filter-bar__totals" aria-live="polite">
      {totals.kind === 'counting' ? 'Counting…' : totals.kind === 'failed' ? 'Kairos could not count these trades.' : describeJournalTotals(totals.totals)}
    </p> : null}

    <Sheet open={sheetOpen} title="Filters" onClose={() => setSheetOpen(false)}>
      <div className="kairos-filter-bar__sheet">
        <Field label="From" id={`${idPrefix}-from`} hint="The day the trade was opened, or planned.">
          {control => <input {...control} type="date" name="from" value={filters.from ?? ''} max={filters.to ?? undefined} onChange={event => set('from', event.target.value === '' ? null : event.target.value)} />}
        </Field>
        <Field label="To" id={`${idPrefix}-to`}>
          {control => <input {...control} type="date" name="to" value={filters.to ?? ''} min={filters.from ?? undefined} onChange={event => set('to', event.target.value === '' ? null : event.target.value)} />}
        </Field>
        <Field label="Market" id={`${idPrefix}-market`}>
          {control => <Select {...control} name="market" value={filters.market ?? ''} options={[{ value: '', label: 'Any market' }, ...options(MARKET_WORDS)]} onChange={event => pick('market')(event.target.value)} />}
        </Field>
        <Field label="Long or Short" id={`${idPrefix}-side`}>
          {control => <Select {...control} name="side" value={filters.side ?? ''} options={[{ value: '', label: 'Both' }, ...options(SIDE_WORDS)]} onChange={event => pick('side')(event.target.value)} />}
        </Field>
        <Field label="Result" id={`${idPrefix}-result`} hint="Closed trades, by their result after fees.">
          {control => <Select {...control} name="result" value={filters.result ?? ''} options={[{ value: '', label: 'Any result' }, ...options(RESULT_WORDS)]} onChange={event => pick('result')(event.target.value)} />}
        </Field>
        <Field label="Strategy" id={`${idPrefix}-strategy`}>
          {control => <Select {...control} name="strategy" value={filters.strategy ?? ''} onChange={event => pick('strategy')(event.target.value)}
            options={[{ value: '', label: 'Any strategy' }, ...withCurrent(strategies, filters.strategy).map(item => ({ value: item.id, label: item.name }))]} />}
        </Field>
        <Field label="Mistake" id={`${idPrefix}-mistake`}>
          {control => <Select {...control} name="mistake" value={filters.mistake ?? ''} onChange={event => pick('mistake')(event.target.value)}
            options={[{ value: '', label: 'Any or none' }, ...withCurrent(mistakes, filters.mistake).map(item => ({ value: item.id, label: item.name }))]} />}
        </Field>
        {scope === 'practice' ? <Field label="How it was made" id={`${idPrefix}-source`}>
          {control => <Select {...control} name="source" value={filters.source ?? ''} options={[{ value: '', label: 'Both' }, { value: 'paper', label: 'By hand' }, { value: 'replay', label: 'In Replay' }]} onChange={event => pick('source')(event.target.value)} />}
        </Field> : null}
        <Button variant="primary" onClick={() => setSheetOpen(false)}>Done</Button>
      </div>
    </Sheet>
  </div>;
}

/** The list's choices, with the address's id kept as a choice even when it is no longer in the list. */
function withCurrent(list: readonly Named[], current: string | null): readonly Named[] {
  return current === null || list.some(item => item.id === current) ? list : [...list, { id: current, name: current }];
}
