import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { analysisHandoffHref } from './analysisHandoff';
import { HomeDashboardGlassBubbleMap, instrumentIdentity, type GlassMapMoves, type GlassMapShownMoves } from './HomeDashboardGlassBubbleMap';
import type { HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration } from './homeDashboardLiveCryptoBubbleRuntimeOptionsComposition';
import { appHomeMarket, type HomeMarket } from './marketDataPorts';
import { useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel } from './useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel';
import { classifyHomeDashboardLiveCryptoBubbleMovement } from '../application/dashboard/homeDashboardLiveCryptoBubblePresentationStateProjection';
import type { MarketMovePeriod, MarketMovesCadence, MarketMovesWindow } from '../application/markets/marketMoves';
import { describeMarketDataUnavailable } from '../application/online/onlineWords';
import { MarketSheet, type MarketSheetCoin } from '../features/home/MarketSheet';

export interface HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntimeProps {
  readonly configuration: HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration;
  /** Passed to the map's "Try again". */
  readonly onRetry?: () => void;
  /** T-061e: the moves, the sheet's line and the coin names; the build's own (appHomeMarket) unless given. */
  readonly market?: HomeMarket;
}

/**
 * D255: coin names when Kairos is sure of them, never waited for. Asked once the map has markets to name (no request
 * while there are no prices); the client shares a read on its way and keeps the names a day, so asking again is free.
 */
function useCoinNames(source: HomeMarket['coinNames'], wanted: boolean): ReadonlyMap<string, string> | null {
  const [names, setNames] = useState<ReadonlyMap<string, string> | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let active = true;
    source.coinNames().then(answer => {
      if (active && answer.ok && answer.names.size > 0) setNames(answer.names);
    }, () => undefined);
    return () => { active = false; };
  }, [source, wanted]);
  return names;
}

function usePageShown(): boolean {
  const [shown, setShown] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const update = () => setShown(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return shown;
}

/**
 * Home's Live Market: the configured browser radius-scale hook gets the caller's configuration, and its model goes once
 * to the glass map. T-061a (D273): the hidden "Market data details" list, redrawn every 5 s, is gone.
 * T-061e (D271): it also holds what sizes the bubbles ("1 hour", "24 hours", "7 days") and the open market sheet. The
 * 1-hour and 7-day moves are read by their owner's cadence (application/markets/marketMoves.ts) only while chosen and
 * seen: the page shown and no sheet over the map. A failed read goes back to 24 hours and says so, with "Try again".
 */
export function HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime({
  configuration,
  onRetry,
  market: given,
}: HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntimeProps) {
  const model = useHomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleViewModel(configuration);
  const market = given ?? appHomeMarket();
  const { reader } = market;
  const moves = useSyncExternalStore(reader.subscribe, reader.state, reader.state);
  const pageShown = usePageShown();
  const [chosen, setChosen] = useState<MarketMovePeriod>('24h');
  /** The window whose read failed: the map is back on 24 hours and says so. */
  const [failed, setFailed] = useState<MarketMovesWindow | null>(null);
  const chosenAt = useRef(0);
  const [openKey, setOpenKey] = useState<string | null>(null);
  /** The bubble that opened the sheet: it takes the focus back when the sheet closes. */
  const tapped = useRef<string | null>(null);
  const section = useRef<HTMLElement>(null);

  const presented = model?.radiusScaleProjection?.ok ? model.radiusScaleProjection.entries.map(entry => entry.areaWeightEntry.presentationEntry) : [];
  const symbols = useRef<readonly string[]>([]);
  symbols.current = presented.map(entry => entry.metricInput.instrument.symbol);
  const hasMarkets = presented.length > 0;
  const names = useCoinNames(market.coinNames, hasMarkets);

  const cadence = useRef<MarketMovesCadence | null>(null);
  useEffect(() => {
    const current = reader.cadence(() => symbols.current);
    cadence.current = current;
    return () => { current.close(); cadence.current = null; };
  }, [reader]);
  useEffect(() => {
    cadence.current?.update({ period: chosen, visible: pageShown && openKey === null && hasMarkets });
  }, [reader, chosen, pageShown, openKey, hasMarkets]);

  // A read of the chosen window that failed since it was chosen (or a source that asked to wait, with no read on its
  // way such as "Try again") sends the map back to 24 hours.
  useEffect(() => {
    if (chosen === '24h' || moves[chosen].pending) return;
    const failure = moves[chosen].failure;
    if (failure === null || (failure.atMs < chosenAt.current && failure.busyUntilMs <= Date.now())) return;
    setFailed(chosen);
    setChosen('24h');
  }, [chosen, moves]);

  const choose = (period: MarketMovePeriod) => { chosenAt.current = Date.now(); setFailed(null); setChosen(period); };
  const reading = chosen === '24h' ? null : moves[chosen].reading;
  const threshold = configuration.neutralMaxAbsoluteMovementPercent;
  const shown = useMemo<GlassMapShownMoves | null>(() => reading === null ? null : Object.freeze({
    period: reading.window,
    observedAt: reading.observedAt,
    values: new Map([...reading.moves].map(([symbol, percent]) => [symbol, Object.freeze({ percent, semantic: percent === null ? null : classifyHomeDashboardLiveCryptoBubbleMovement(percent, threshold) })])),
  }), [reading, threshold]);
  const failure = failed === null ? null : moves[failed].failure;
  const mapMoves: GlassMapMoves = {
    chosen,
    onChoose: choose,
    shown,
    loading: chosen !== '24h' && reading === null && moves[chosen].failure === null,
    unavailable: failed === null ? null : Object.freeze({
      window: failed,
      retry: failure === null || describeMarketDataUnavailable(failure.unavailable, 'Moves').retryLabel !== null,
      busy: moves[failed].pending,
    }),
    onRetry: () => {
      if (failed === null) return;
      choose(failed);
      void reader.ensure(failed, symbols.current, { byTrader: true });
    },
  };

  // The sheet shows the market's live price and 24-hour move as they update; one that leaves the map keeps its last.
  const lastCoin = useRef<MarketSheetCoin | null>(null);
  let coin: MarketSheetCoin | null = null;
  if (openKey !== null) {
    const entry = presented.find(item => instrumentIdentity(item.metricInput.instrument.venue, item.metricInput.instrument.symbol) === openKey);
    if (entry === undefined) coin = lastCoin.current;
    else {
      const metric = entry.metricInput;
      const symbol = metric.instrument.symbol;
      const base = symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol;
      const expired = entry.freshnessState === 'expired' || entry.freshnessState === 'missing';
      coin = Object.freeze({
        instrument: metric.instrument, base, quote: symbol.endsWith('USDT') ? 'USDT' : null, name: names?.get(base) ?? null,
        price: metric.fact?.lastPrice ?? null, observedAt: metric.fact?.observedAt ?? null, move24h: expired ? null : metric.movementPercent24h,
      });
    }
  }
  lastCoin.current = coin;
  const returnFocusTo = () => {
    const bubbles = [...(section.current?.querySelectorAll<HTMLElement>('[data-glass-key]') ?? [])];
    // A bubble gone from the map: the switch's choice holds the focus (never the page).
    return bubbles.find(bubble => bubble.dataset.glassKey === tapped.current)
      ?? section.current?.querySelector<HTMLElement>('.kairos-segmented button[aria-pressed="true"]') ?? null;
  };

  return <>
    <HomeDashboardGlassBubbleMap model={model} onRetry={onRetry} moves={mapMoves} names={names} sectionRef={section}
      onOpen={key => { tapped.current = key; setOpenKey(key); }} />
    <MarketSheet coin={coin} period={chosen} reader={reader} symbols={() => symbols.current}
      chartHref={coin === null ? '/analysis' : analysisHandoffHref({ venue: coin.instrument.venue, instrument: coin.instrument.symbol }, null)}
      onClose={() => setOpenKey(null)} returnFocusTo={returnFocusTo} />
  </>;
}
