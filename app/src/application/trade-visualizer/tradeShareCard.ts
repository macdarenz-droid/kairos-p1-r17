import { decimalCompare } from '../../domain/calculations';
import type { DecimalString } from '../../domain/trades';
import { signedText } from '../performance/tradeRisk';
import type { TradePictureInfoKey, TradePictureModel } from './tradePicture';

export type TradeShareVerdict = 'Won' | 'Lost' | 'Break-even' | 'Open' | 'Planned' | 'Cancelled' | 'No result yet';
export type TradeShareOutcome = 'profit' | 'loss' | 'breakeven' | 'none';

export interface TradeShareFact {
  readonly key: TradePictureInfoKey | 'strategy';
  readonly label: string;
  readonly text: string;
}

export interface TradeShareCard {
  /** The market as the picture names it ("EUR/USD" for a forex pair). */
  readonly symbol: string;
  readonly side: 'Long' | 'Short';
  readonly verdict: TradeShareVerdict;
  /** The big line: the result after fees; with money hidden (or no result) × what you risked; then the planned reward; else the verdict. */
  readonly headline: Readonly<{ text: string; outcome: TradeShareOutcome }>;
  readonly facts: readonly TradeShareFact[];
  readonly candleWords: string | null;
  /** UTC ISO times; the screen formats them. */
  readonly opened: string | null;
  readonly closed: string | null;
  readonly hideMoney: boolean;
}

export interface TradeShareCardOptions {
  /** D215: leave out every money amount (results, fees, money at risk, size, pip value, per-share result). */
  readonly hideMoney: boolean;
  /** The strategy the trader chose for this trade (P28), when there is one. */
  readonly strategyName?: string | null;
}

const OUTCOME_OF: Readonly<Record<'Won' | 'Lost' | 'Break-even', TradeShareOutcome>> = Object.freeze({ Won: 'profit', Lost: 'loss', 'Break-even': 'breakeven' });

/**
 * U6 (D214, D215): what the share card says about one trade, read from the picture model only, so every
 * number keeps its owner. The drawing is the picture's own; this decides the words around it.
 */
export function projectTradeShareCard(model: TradePictureModel, options: TradeShareCardOptions): TradeShareCard {
  const row = (key: TradePictureInfoKey) => model.info.find(item => item.key === key) ?? null;
  const text = (key: TradePictureInfoKey) => row(key)?.text ?? null;
  const result = row('result');

  let verdict: TradeShareVerdict;
  if (model.status === 'draft') verdict = 'Planned';
  else if (model.status === 'open') verdict = 'Open';
  else if (model.status === 'cancelled') verdict = 'Cancelled';
  else {
    const order = result?.value == null ? null : decimalCompare(result.value, '0');
    verdict = order === null ? 'No result yet' : order > 0 ? 'Won' : order < 0 ? 'Lost' : 'Break-even';
  }
  const outcome: TradeShareOutcome = verdict === 'Won' || verdict === 'Lost' || verdict === 'Break-even' ? OUTCOME_OF[verdict] : 'none';

  const timesRisked = text('actual-r');
  const plannedReward = text('planned-reward');
  // The result row's value is the metrics owner's net result, a decimal.
  const resultText = result?.value == null ? null : `${signedText(result.value as DecimalString)}${result.unit ? ` ${result.unit}` : ''}`;
  const headline = { text: (!options.hideMoney ? resultText : null) ?? timesRisked ?? plannedReward ?? verdict, outcome };

  // A fact never repeats the headline; the result after fees is the headline or hidden, never a fact.
  const facts: TradeShareFact[] = [];
  const add = (key: TradeShareFact['key'], label: string, value: string | null) => {
    if (value !== null && value !== '' && value !== headline.text) facts.push(Object.freeze({ key, label, text: value }));
  };
  add('actual-r', '× what you risked', timesRisked);
  add('planned-reward', 'Planned reward', plannedReward);
  add('duration', 'How long it lasted', text('duration'));
  add('strategy', 'Strategy', options.strategyName?.trim() || null);
  if (!options.hideMoney) {
    const moneyAtRisk = row('money-at-risk');
    add('money-at-risk', 'Money at risk', moneyAtRisk?.value == null ? null : moneyAtRisk.text);
    add('size', 'Size', row('size')?.value == null ? null : text('size'));
  }

  return Object.freeze({
    symbol: text('market') ?? model.symbol,
    side: model.side === 'long' ? 'Long' : 'Short',
    verdict,
    headline: Object.freeze(headline),
    facts: Object.freeze(facts),
    candleWords: model.candleWords,
    opened: row('opened')?.value ?? null,
    closed: row('closed')?.value ?? null,
    hideMoney: options.hideMoney,
  });
}

/** One sentence for the card's image: "BTCUSDT long, won, +120.5 USDT, +1.85× what you risked, strategy Breakout". */
export function describeTradeShareCard(card: TradeShareCard): string {
  const parts = [`${card.symbol} ${card.side.toLowerCase()}`, card.verdict.toLowerCase()];
  if (card.headline.text !== card.verdict) parts.push(card.headline.text);
  const timesRisked = card.facts.find(fact => fact.key === 'actual-r');
  if (timesRisked) parts.push(timesRisked.text);
  const strategy = card.facts.find(fact => fact.key === 'strategy');
  if (strategy) parts.push(`strategy ${strategy.text}`);
  return parts.join(', ');
}
