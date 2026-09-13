import { useEffect, useRef, useState } from 'react';
import type { ThemeId } from '../design-system/themes';
import type { MarketDataConnectionState, MarketDataInstrument } from '../services/market-data/marketDataTypes';
import {
  createAnalysisLiveCandleRouteSession,
  type AnalysisLiveCandleRouteSession,
} from './analysisLiveCandleRouteSession';
import type { BinanceAnalysisLiveCandleBrowserAvailability } from './binanceAnalysisLiveCandleBrowserAvailabilityLifecycle';
import type { BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleResult } from './binanceAnalysisLiveCandleBrowserAvailabilityLifecycle';
import type {
  BinanceAnalysisCandleBackfillRequest,
  BinanceAnalysisLiveCandleDisposition,
} from './binanceAnalysisLiveCandleProjectionRendererCoordination';
import type { BinanceAnalysisLiveCandleGapBackfillRecoveryResult } from './binanceAnalysisLiveCandleGapBackfillRecoveryCoordination';

export interface AnalysisLiveCandleReactBindingOptions {
  readonly container: HTMLElement;
  readonly instrument: MarketDataInstrument;
  readonly interval: string;
  readonly themeId: ThemeId;
  /** Caller-owned refresh key; changing it reacquires the exact selected scope. */
  readonly revision?: number;
  readonly createSession?: typeof createAnalysisLiveCandleRouteSession;
}

export interface AnalysisLiveCandleReactBindingState {
  readonly availability: BinanceAnalysisLiveCandleBrowserAvailability | null;
  readonly activation: BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleResult | null;
  readonly connection: MarketDataConnectionState | null;
  readonly disposition: BinanceAnalysisLiveCandleDisposition | null;
  readonly backfillRequest: BinanceAnalysisCandleBackfillRequest | null;
  readonly backfillRecovery: BinanceAnalysisLiveCandleGapBackfillRecoveryResult | null;
  readonly lastError: unknown | null;
}

const initialState = (): AnalysisLiveCandleReactBindingState => ({
  availability: null,
  activation: null,
  connection: null,
  disposition: null,
  backfillRequest: null,
  backfillRecovery: null,
  lastError: null,
});

/**
 * React lifecycle/state binding for the released Gate430 route session.
 * Exact observations are retained without choosing visible copy. Selection
 * changes replace through the same session, theme-only changes do not restart
 * it, and unmount closes the released owner once.
 */
export function useAnalysisLiveCandleRouteSession({
  container,
  instrument,
  interval,
  themeId,
  revision = 0,
  createSession = createAnalysisLiveCandleRouteSession,
}: AnalysisLiveCandleReactBindingOptions): AnalysisLiveCandleReactBindingState {
  const [state, setState] = useState<AnalysisLiveCandleReactBindingState>(initialState);
  const session = useRef<AnalysisLiveCandleRouteSession | null>(null);
  const generation = useRef(0);
  const latestInstrument = useRef(instrument);
  const latestThemeId = useRef(themeId);
  latestInstrument.current = instrument;
  latestThemeId.current = themeId;

  useEffect(() => {
    let created: AnalysisLiveCandleRouteSession;
    try {
      created = createSession();
    } catch (error: unknown) {
      setState({ ...initialState(), lastError: error });
      return;
    }
    session.current = created;
    return () => {
      generation.current += 1;
      session.current = null;
      created.close();
    };
  }, [createSession]);

  useEffect(() => {
    const currentSession = session.current;
    if (!currentSession) return;
    const ticket = ++generation.current;
    let active = true;
    const current = () => active && session.current === currentSession && generation.current === ticket;
    const update = (patch: Partial<AnalysisLiveCandleReactBindingState>) => {
      if (current()) setState(value => ({ ...value, ...patch }));
    };

    setState({ ...initialState(), availability: currentSession.availability() });
    let activation: Promise<BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleResult>;
    try {
      activation = currentSession.replace({
        container,
        instrument: latestInstrument.current,
        interval,
        themeId: latestThemeId.current,
        onAvailabilityChange: availability => update({ availability }),
        onActivationResult: result => update({ activation: result }),
        onStateChange: connection => update({ connection }),
        onDisposition: disposition => update({ disposition }),
        onBackfillRequired: backfillRequest => update({ backfillRequest }),
        onBackfillRecovery: backfillRecovery => update({ backfillRecovery }),
        onError: lastError => update({ lastError }),
      });
    } catch (error: unknown) {
      update({ lastError: error });
      return () => { active = false; };
    }
    void activation.then(result => update({ activation: result })).catch(error => update({ lastError: error }));
    return () => { active = false; };
  }, [container, createSession, instrument.venue, instrument.symbol, interval, revision]);

  useEffect(() => {
    session.current?.setTheme(themeId);
  }, [createSession, themeId]);

  return state;
}
