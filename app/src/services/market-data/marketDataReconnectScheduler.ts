export interface MarketDataReconnectScheduler {
  readonly schedule: (callback: () => void, delayMs: number) => unknown;
  readonly cancel: (handle: unknown) => void;
}

export interface MarketDataReconnectSchedule {
  readonly cancel: () => void;
}

export function scheduleMarketDataReconnect(
  scheduler: MarketDataReconnectScheduler,
  delayMs: number,
  reconnect: () => void,
  signal?: AbortSignal,
): MarketDataReconnectSchedule {
  let settled = false;
  let handle: unknown;

  const cancel = () => {
    if (settled) return;
    settled = true;
    signal?.removeEventListener('abort', cancel);
    scheduler.cancel(handle);
  };

  if (signal?.aborted) {
    settled = true;
    return { cancel };
  }

  handle = scheduler.schedule(() => {
    if (settled) return;
    settled = true;
    signal?.removeEventListener('abort', cancel);
    reconnect();
  }, delayMs);

  signal?.addEventListener('abort', cancel, { once: true });

  return { cancel };
}
