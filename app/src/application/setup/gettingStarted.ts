/**
 * T-053e (D224): Home's "Getting started": six steps, each ticked from the owner of what it asks for. Nothing is
 * worked out here but whether each step is done; the card hides itself when all are done, or when the trader hides it.
 */

import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import { readHomeCurrency } from '../currency/homeCurrency';
import { disciplineListsPreferenceMetadataKey } from '../discipline/disciplineListsPreference';
import { readGoalsPreference } from '../goals/goalsPreference';
import { JOURNAL_HISTORY_SOURCES } from '../journal/historyQuery';
import { readVisualPnlTimeZonePreference } from '../visual-pnl/timeZonePreference';
import { readSetupState } from './setupState';
import { readTradedMarkets } from './tradedMarkets';

export type GettingStartedStepKey = 'time-zone' | 'home-currency' | 'traded-markets' | 'checklist' | 'first-goal' | 'first-trade';

export interface GettingStartedStep {
  readonly key: GettingStartedStepKey;
  readonly label: string;
  readonly done: boolean;
  /** The setup step that does it (`/setup?step=N`); null for the first trade, which is logged in the Journal. */
  readonly setupStep: number | null;
}

export interface GettingStarted {
  readonly steps: readonly GettingStartedStep[];
  readonly doneCount: number;
  readonly allDone: boolean;
  /** The trader hid the card ("Hide"). */
  readonly hidden: boolean;
}

/**
 * Reads each step's owner once. A practice trade does not count as the first trade. The reads go one after another:
 * a database that cannot open fails the first, and the rest never start.
 */
export async function loadGettingStarted(db: KairosDatabase): Promise<GettingStarted> {
  const repositories = createKairosRepositories(db);
  const { metadata } = repositories;
  const setup = await readSetupState(metadata);
  const timeZone = await readVisualPnlTimeZonePreference(metadata);
  const currency = await readHomeCurrency(metadata);
  const markets = await readTradedMarkets(metadata);
  const lists = await metadata.get(disciplineListsPreferenceMetadataKey);
  const goals = await readGoalsPreference(metadata);
  const trades = await repositories.trades.scopedBySource(JOURNAL_HISTORY_SOURCES.real).listRecentByUpdatedAt(1);
  const goalSet = goals.tradesPerMonthTarget !== null || goals.maxTradesPerDay !== null || goals.monthlyResultTarget !== null;
  const steps: GettingStartedStep[] = [
    { key: 'time-zone', label: 'Your time zone', done: timeZone !== null, setupStep: 1 },
    { key: 'home-currency', label: 'Your home currency', done: currency !== null, setupStep: 2 },
    { key: 'traded-markets', label: 'What you trade', done: markets !== null, setupStep: 3 },
    { key: 'checklist', label: 'Your checklist', done: lists !== undefined, setupStep: 4 },
    { key: 'first-goal', label: 'Your first goal', done: goalSet, setupStep: 5 },
    { key: 'first-trade', label: 'Your first trade', done: trades.length > 0, setupStep: null },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  return Object.freeze({ steps: Object.freeze(steps.map((step) => Object.freeze(step))), doneCount, allDone: doneCount === steps.length, hidden: setup.cardHiddenAt !== null });
}
