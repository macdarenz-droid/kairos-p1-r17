import type { MarketCandleHistoryPort } from '../../services/market-data/MarketCandleHistoryPort';
import type { MarketDataInstrument } from '../../services/market-data/marketDataTypes';
import { estimateMarketReferenceAt, type EstimateMarketReferenceOptions, type EstimatedMarketReference } from './estimatedMarketReference';

export type TimeAssistedTradeSide = 'long' | 'short';

export interface TimeAssistedTradeSnapshotRequest {
  readonly instrument: MarketDataInstrument;
  readonly side: TimeAssistedTradeSide;
  /** ISO-8601 opening instant (any offset). */
  readonly openedAt: string;
  /** ISO-8601 closing instant, or null for a trade that is still open. */
  readonly closedAt: string | null;
}

/**
 * P22.2 time-assisted trade snapshot: the two P22.1 estimates for the opening
 * and closing instants plus the exact duration. It carries no price, no
 * result and no journal identity; it is a disclosed market-reference preview.
 */
export interface TimeAssistedTradeSnapshot {
  readonly kind: 'snapshot';
  readonly isEstimate: true;
  readonly source: 'market-reference';
  readonly instrument: MarketDataInstrument;
  readonly side: TimeAssistedTradeSide;
  readonly opening: EstimatedMarketReference;
  readonly closing: EstimatedMarketReference | null;
  readonly durationMs: number | null;
}

export interface TimeAssistedTradeSnapshotInvalid {
  readonly kind: 'invalid';
  readonly reason: 'side-invalid' | 'opened-at-invalid' | 'closed-at-invalid' | 'closed-before-opened';
}

export type TimeAssistedTradeSnapshotResult = TimeAssistedTradeSnapshot | TimeAssistedTradeSnapshotInvalid;

const parseInstant = (value: string): number | null => {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Validates the request shape first (no port call for an invalid request),
 * then resolves the opening and closing estimates through the released P22.1
 * boundary over the released P15/P16 history port. Each estimate reports its
 * own availability; one unavailable instant never hides the other.
 */
export async function composeTimeAssistedTradeSnapshot(
  port: Pick<MarketCandleHistoryPort, 'acquireHistory'>,
  request: TimeAssistedTradeSnapshotRequest,
  options: EstimateMarketReferenceOptions = {},
): Promise<TimeAssistedTradeSnapshotResult> {
  const invalid = (reason: TimeAssistedTradeSnapshotInvalid['reason']): TimeAssistedTradeSnapshotInvalid => Object.freeze({ kind: 'invalid' as const, reason });
  if (request.side !== 'long' && request.side !== 'short') return invalid('side-invalid');
  const openedMs = parseInstant(request.openedAt);
  if (openedMs === null) return invalid('opened-at-invalid');
  const closedMs = request.closedAt === null ? null : parseInstant(request.closedAt);
  if (request.closedAt !== null && closedMs === null) return invalid('closed-at-invalid');
  if (closedMs !== null && closedMs < openedMs) return invalid('closed-before-opened');
  const [opening, closing] = await Promise.all([
    estimateMarketReferenceAt(port, { instrument: request.instrument, requestedAt: request.openedAt }, options),
    request.closedAt === null ? Promise.resolve(null) : estimateMarketReferenceAt(port, { instrument: request.instrument, requestedAt: request.closedAt }, options),
  ]);
  return Object.freeze({
    kind: 'snapshot' as const,
    isEstimate: true as const,
    source: 'market-reference' as const,
    instrument: request.instrument,
    side: request.side,
    opening,
    closing,
    durationMs: closedMs === null ? null : closedMs - openedMs,
  });
}
