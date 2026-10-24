export type Brand<Value, Name extends string> = Value & { readonly __brand: Name };

export type TradeId = Brand<string, 'TradeId'>;
export type TradePlanId = Brand<string, 'TradePlanId'>;
export type TradeExecutionId = Brand<string, 'TradeExecutionId'>;
export type TradeFeeId = Brand<string, 'TradeFeeId'>;
export type DecimalString = Brand<string, 'DecimalString'>;

export type TradeStatus = 'draft' | 'open' | 'closed' | 'cancelled';
export type TradeSide = 'long' | 'short';
export type TradeSource = 'manual' | 'paper' | 'replay' | 'import' | 'broker-import';
export type MarketType = 'stock' | 'forex' | 'crypto' | 'futures' | 'options' | 'other';
export type TradeExecutionType = 'entry' | 'exit';

export interface TradeRecord {
  readonly id: TradeId;
  readonly symbol: string;
  readonly marketType: MarketType;
  readonly side: TradeSide;
  readonly status: TradeStatus;
  readonly source: TradeSource;
  /** Explicit user-recorded unit of execution prices/P&L. Missing remains unknown. */
  readonly grossPnlCurrency?: string | null;
  /** U11 (D237): what one point of price is worth for one contract, in the price currency. Absent: not recorded. */
  readonly contractSize?: DecimalString | null;
  /** U11 (D238): where it was traded, as the trader named it (at most 40 characters). Absent: not recorded. */
  readonly exchange?: string | null;
  /** U11 (D239): the trader's own tags, written the one way by `normalizeTradeTags`. Absent: none. */
  readonly tags?: readonly string[];
  /** U11: the leverage used; 10 means 10×. Absent: not recorded. */
  readonly leverage?: DecimalString | null;
  readonly openedAt: string | null;
  readonly closedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TradePlanRecord {
  readonly id: TradePlanId;
  readonly tradeId: TradeId;
  readonly plannedEntryPrice: DecimalString | null;
  readonly plannedStopPrice: DecimalString | null;
  readonly plannedTargetPrice: DecimalString | null;
  readonly plannedQuantity: DecimalString | null;
  /** U11: "Why I'm taking it" (at most 500 characters). Absent: not written. */
  readonly reason?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TradeExecutionRecord {
  readonly id: TradeExecutionId;
  readonly tradeId: TradeId;
  readonly type: TradeExecutionType;
  readonly price: DecimalString;
  readonly quantity: DecimalString;
  readonly executedAt: string;
  readonly createdAt: string;
}

export interface TradeFeeRecord {
  readonly id: TradeFeeId;
  readonly tradeId: TradeId;
  readonly executionId: TradeExecutionId | null;
  readonly amount: DecimalString;
  readonly currency: string;
  readonly createdAt: string;
}
