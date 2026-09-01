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
