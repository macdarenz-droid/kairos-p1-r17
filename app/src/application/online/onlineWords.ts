/**
 * U1: the words every online feature shows when the Kairos server or the network fails ("Unavailable", one plain
 * sentence, and "Try again" unless a retry cannot help), plus the Profile line about online services. The failure
 * types come from services/kairos-api (types only, D31); screens show these words and never write their own.
 */
import type { KairosApiFailure, KairosApiHealth, KairosApiResult } from '../../services/kairos-api/kairosApi';

export type { KairosApiFailure, KairosApiHealth, KairosApiHealthPort, KairosApiResult } from '../../services/kairos-api/kairosApi';

export interface UnavailableWords {
  readonly title: 'Unavailable';
  readonly message: string;
  /** null: a retry cannot help (this build has no server address, or the server is not ready for it). */
  readonly retryLabel: 'Try again' | null;
  /** Seconds the server asked to wait, or null. */
  readonly retryAfterSeconds: number | null;
}

const words = (message: string, retry: boolean, retryAfterSeconds: number | null): UnavailableWords =>
  Object.freeze({ title: 'Unavailable' as const, message, retryLabel: retry ? ('Try again' as const) : null, retryAfterSeconds });

/** `subject` names what was being fetched, as the start of a sentence: "News", "Candles", "Online services". */
export function describeUnavailable(failure: KairosApiFailure, subject: string): UnavailableWords {
  switch (failure.reason) {
    case 'not-set-up': return words(`${subject}: not set up in this version of Kairos.`, false, null);
    case 'transport-failed': return words(`${subject}: Kairos could not reach its server. Check your connection, then try again.`, true, null);
    case 'invalid-response': return words(`${subject}: the answer could not be read. Try again later.`, true, null);
    case 'unavailable':
      switch (failure.serverReason) {
        case 'rate-limited': return words(`${subject}: too many requests from this device. Wait a minute, then try again.`, true, failure.retryAfterSeconds);
        case 'source-unavailable': return words(`${subject}: the source did not answer. Try again in a moment.`, true, failure.retryAfterSeconds);
        case 'not-set-up': return words(`${subject}: not ready on the Kairos server yet.`, false, null);
        case 'device-not-recognised': return words(`${subject}: the Kairos server did not recognise this device.`, false, null);
        default: return words(`${subject}: unavailable right now. Try again later.`, true, failure.retryAfterSeconds);
      }
  }
}

export type OnlineServicesLine =
  | Readonly<{ kind: 'working'; text: string }>
  | Readonly<{ kind: 'unavailable'; words: UnavailableWords }>;

export function describeOnlineServices(result: KairosApiResult<KairosApiHealth>): OnlineServicesLine {
  if (!result.ok) return Object.freeze({ kind: 'unavailable' as const, words: describeUnavailable(result, 'Online services') });
  const device = {
    recognised: 'This device is recognised.',
    'not-sent': 'This device did not send its activation.',
    'not-recognised': 'The server did not recognise this device.',
    'not-checked': 'The server cannot check devices yet.',
  }[result.value.device];
  return Object.freeze({ kind: 'working' as const, text: `Online services are working. ${device}` });
}
