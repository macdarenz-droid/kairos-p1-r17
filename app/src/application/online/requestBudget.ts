/**
 * T-061e (D271, review r1): a request budget over the last 60 seconds. The Kairos server allows 30 requests a minute
 * for a device that is not activated (120 when it is), counted before its cache; Home shares one budget for its reads
 * beyond the live prices and the price now: the news refresh (one request per official calendar, all at once) and the
 * market moves and market sheet's line (one each). The minute-by-minute count is in application/markets/marketMoves.ts.
 */

/** Home's shared reads in any 60 seconds: with everything else Home asks in its busiest minute, 30 in all. */
export const HOME_SHARED_READS_PER_MINUTE = 9;
const WINDOW_MS = 60_000;

export interface RequestBudget {
  /**
   * Waits until `count` requests fit in the last 60 seconds, in the order asked (a big ask is never passed by small
   * ones), then counts them as sent; false when the signal aborts first, and then nothing is counted.
   */
  take(count: number, signal?: AbortSignal): Promise<boolean>;
  /** Gives back `count` requests taken but never sent (the read was abandoned before it left), newest first. */
  refund(count: number): void;
}

export function createRequestBudget(perMinute: number, now: () => number = () => Date.now()): RequestBudget {
  /** When each counted request started, oldest first. */
  const starts: number[] = [];
  const line: { readonly count: number; readonly grant: () => void }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  // An ask bigger than the whole budget waits for an empty minute, never forever.
  const fit = (count: number) => Math.min(Math.max(1, Math.floor(count)), perMinute);

  const pump = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    const at = now();
    while (starts.length > 0 && at - starts[0]! >= WINDOW_MS) starts.shift();
    while (line.length > 0 && starts.length + line[0]!.count <= perMinute) {
      const next = line.shift()!;
      for (let i = 0; i < next.count; i += 1) starts.push(at);
      next.grant();
    }
    if (line.length === 0) return;
    // The head waits for just enough of the oldest requests to leave the window.
    const freedBy = starts[starts.length + line[0]!.count - perMinute - 1]!;
    timer = setTimeout(pump, Math.max(0, freedBy + WINDOW_MS - at));
  };

  return Object.freeze({
    take(count: number, signal?: AbortSignal): Promise<boolean> {
      if (signal?.aborted) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        const onAbort = () => {
          const index = line.indexOf(entry);
          if (index >= 0) line.splice(index, 1);
          resolve(false);
          pump();
        };
        const entry = { count: fit(count), grant: () => { signal?.removeEventListener('abort', onAbort); resolve(true); } };
        signal?.addEventListener('abort', onAbort, { once: true });
        line.push(entry);
        pump();
      });
    },
    refund(count: number): void {
      starts.splice(Math.max(0, starts.length - fit(count)));
      pump();
    },
  });
}
