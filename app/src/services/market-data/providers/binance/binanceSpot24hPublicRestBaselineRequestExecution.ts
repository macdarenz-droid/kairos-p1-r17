import type { BinanceSpot24hPublicRestBaselineRequestDescriptor } from './binanceSpot24hPublicRestBaselineRequest';

export interface BinanceSpot24hPublicRestBaselineExecutionOptions {
  readonly signal?: AbortSignal;
}

/**
 * Injected execution seam only. Concrete network and response representation
 * remain owned by the caller-supplied connector. Optional caller cancellation
 * is forwarded unchanged; this owner does not create or interpret it.
 */
export type BinanceSpot24hPublicRestBaselineRequestConnector<TResult> = (
  request: BinanceSpot24hPublicRestBaselineRequestDescriptor,
  options?: BinanceSpot24hPublicRestBaselineExecutionOptions,
) => Promise<TResult>;

/**
 * Executes exactly one already-described request. Existing no-options callers
 * retain the exact one-argument connector call; supplied options are forwarded
 * unchanged so a later concrete connector can honor caller cancellation.
 */
export function executeBinanceSpot24hPublicRestBaselineRequest<TResult>(
  request: BinanceSpot24hPublicRestBaselineRequestDescriptor,
  connect: BinanceSpot24hPublicRestBaselineRequestConnector<TResult>,
  options?: BinanceSpot24hPublicRestBaselineExecutionOptions,
): Promise<TResult> {
  if (options === undefined) return connect(request);
  return connect(request, options);
}
