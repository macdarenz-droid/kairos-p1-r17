export type MarketDataReconnectDisposition =
  | { readonly retry: true }
  | { readonly retry: false; readonly reason: 'intentional-close' | 'terminal-failure' };

export type MarketDataDisconnectCause =
  | { readonly kind: 'transient-failure' }
  | { readonly kind: 'intentional-close' }
  | { readonly kind: 'terminal-failure' };

export function classifyMarketDataReconnectDisposition(
  cause: MarketDataDisconnectCause,
): MarketDataReconnectDisposition {
  switch (cause.kind) {
    case 'transient-failure':
      return { retry: true };
    case 'intentional-close':
      return { retry: false, reason: 'intentional-close' };
    case 'terminal-failure':
      return { retry: false, reason: 'terminal-failure' };
  }
}
