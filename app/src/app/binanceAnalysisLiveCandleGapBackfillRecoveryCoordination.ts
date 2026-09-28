import type { BinanceAnalysisCandleBackfillRequest } from './binanceAnalysisLiveCandleProjectionRendererCoordination';
import type {
  BinanceAnalysisHistoryLiveCandleBootstrapCoordinator,
  BinanceAnalysisHistoryLiveCandleBootstrapOptions,
  BinanceAnalysisHistoryLiveCandleBootstrapResult,
} from './binanceAnalysisHistoryLiveCandleBootstrapCoordination';

export type BinanceAnalysisLiveCandleGapBackfillRecoveryResult =
  | BinanceAnalysisHistoryLiveCandleBootstrapResult
  | { readonly ok: false; readonly reason: 'backfill-scope-mismatch' };

export type BinanceAnalysisLiveCandleGapBackfillRecoveryOptions = Omit<
  BinanceAnalysisHistoryLiveCandleBootstrapOptions,
  'onBackfillRequired'
> & {
  /** Optional observation of a valid recovery demand; execution stays here. */
  readonly onBackfillRequired?: (request: BinanceAnalysisCandleBackfillRequest) => void;
  readonly onBackfillRecovery?: (result: BinanceAnalysisLiveCandleGapBackfillRecoveryResult) => void;
};

export interface BinanceAnalysisLiveCandleGapBackfillRecoveryCoordinator {
  replace(options: BinanceAnalysisLiveCandleGapBackfillRecoveryOptions): Promise<BinanceAnalysisHistoryLiveCandleBootstrapResult>;
  stop(): void;
  isPending(): boolean;
  isLive(): boolean;
  isRecovering(): boolean;
}

/**
 * Owns only gap recovery above Gate420. One valid exact-scope demand stops the
 * current live session through Gate420, reacquires a fresh authoritative page,
 * renders that snapshot and starts a replacement live session from its final
 * candle. Duplicate, stale and mismatched demands cannot create a competing
 * acquisition or mutate chart state.
 */
export function createBinanceAnalysisLiveCandleGapBackfillRecoveryCoordinator(
  bootstrap: BinanceAnalysisHistoryLiveCandleBootstrapCoordinator,
): BinanceAnalysisLiveCandleGapBackfillRecoveryCoordinator {
  let generation = 0;
  let active: BinanceAnalysisLiveCandleGapBackfillRecoveryOptions | null = null;
  let recovering = false;

  const current = (ticket: number) => ticket === generation;

  const scoped = (
    options: BinanceAnalysisLiveCandleGapBackfillRecoveryOptions,
    request: BinanceAnalysisCandleBackfillRequest,
  ) => request.instrument.venue === options.instrument.venue
    && request.instrument.symbol === options.instrument.symbol
    && request.interval === options.interval;

  const launch = (
    ticket: number,
    options: BinanceAnalysisLiveCandleGapBackfillRecoveryOptions,
  ): Promise<BinanceAnalysisHistoryLiveCandleBootstrapResult> => {
    const { onBackfillRequired, onBackfillRecovery, ...bootstrapOptions } = options;
    return bootstrap.replace({
      ...bootstrapOptions,
      onBackfillRequired: request => {
        if (!current(ticket) || recovering) return;
        if (!scoped(options, request)) {
          onBackfillRecovery?.({ ok: false, reason: 'backfill-scope-mismatch' });
          return;
        }
        recovering = true;
        onBackfillRequired?.(request);
        void launch(ticket, options).then(result => {
          if (!current(ticket)) return;
          recovering = false;
          if (!result.ok) active = null;
          onBackfillRecovery?.(result);
        });
      },
    });
  };

  return {
    async replace(options) {
      const ticket = ++generation;
      active = options;
      recovering = false;
      const result = await launch(ticket, options);
      if (current(ticket) && !result.ok) active = null;
      return result;
    },
    stop() {
      generation += 1;
      active = null;
      recovering = false;
      bootstrap.stop();
    },
    isPending() {
      return bootstrap.isPending();
    },
    isLive() {
      return active !== null && bootstrap.isLive();
    },
    isRecovering() {
      return recovering;
    },
  };
}
