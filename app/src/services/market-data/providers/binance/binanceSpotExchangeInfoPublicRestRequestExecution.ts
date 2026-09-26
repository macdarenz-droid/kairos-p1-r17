import type { BinanceSpotExchangeInfoPublicRestRequestDescriptor } from './binanceSpotExchangeInfoPublicRestRequest';

export interface BinanceSpotExchangeInfoPublicRestExecutionOptions {
  readonly signal?: AbortSignal;
}

/**
 * Injected execution seam only. Concrete network and response representation
 * remain owned by the caller-supplied connector. Optional caller cancellation
 * is forwarded unchanged; this owner does not create or interpret it.
 */
export type BinanceSpotExchangeInfoPublicRestRequestConnector<TResult> = (
  request: BinanceSpotExchangeInfoPublicRestRequestDescriptor,
  options?: BinanceSpotExchangeInfoPublicRestExecutionOptions,
) => Promise<TResult>;

/**
 * Executes exactly one already-described exchangeInfo request. Existing
 * no-options callers retain the exact one-argument connector invocation;
 * supplied options are forwarded unchanged.
 */
export function executeBinanceSpotExchangeInfoPublicRestRequest<TResult>(
  request: BinanceSpotExchangeInfoPublicRestRequestDescriptor,
  connect: BinanceSpotExchangeInfoPublicRestRequestConnector<TResult>,
  options?: BinanceSpotExchangeInfoPublicRestExecutionOptions,
): Promise<TResult> {
  if (options === undefined) return connect(request);
  return connect(request, options);
}
