import { useEffect, useRef, useState } from 'react';
import { getChartTheme, useTheme } from '../design-system/themes';
import type { PresentedChartRenderer } from '../features/chart/lightweightChartsV5ProductionRenderer';
import type { MarketCandleHistorySnapshot } from '../services/market-data/MarketCandleHistoryPort';
import { createAnalysisCandleRendererSession } from './analysisCandleRendererSession';

export function AnalysisCandleCanvas({ snapshot }: { readonly snapshot: MarketCandleHistorySnapshot }) {
  const { themeId } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<PresentedChartRenderer | null>(null);
  const [failed, setFailed] = useState(false);
  const latestTheme = useRef(themeId); latestTheme.current = themeId;
  useEffect(() => {
    if (!container.current) return;
    setFailed(false);
    let session: PresentedChartRenderer | null = null;
    try {
      session = createAnalysisCandleRendererSession({ container: container.current, snapshot, themeId: latestTheme.current });
      renderer.current = session;
    } catch { setFailed(true); }
    return () => { renderer.current = null; session?.destroy(); };
  }, [snapshot]);
  useEffect(() => { renderer.current?.setTheme(getChartTheme(themeId)); }, [themeId]);
  return <>
    <div className="kairos-analysis-chart__canvas" ref={container} tabIndex={0} role="group" aria-label={`${snapshot.request.instrument.symbol} historical candlestick chart`} aria-describedby="kairos-chart-help" onKeyDown={event => {
      const session = renderer.current; if (!session) return;
      if (event.key === 'ArrowLeft') session.pan(-.2);
      else if (event.key === 'ArrowRight') session.pan(.2);
      else if (event.key === '+' || event.key === '=') session.zoom(.8);
      else if (event.key === '-') session.zoom(1.25);
      else if (event.key === 'Home') session.resetView();
      else return;
      event.preventDefault();
    }} />
    {failed ? <p role="alert">The chart could not be displayed on this device.</p> : <div className="kairos-analysis-chart__tools" aria-label="Chart view controls">
      <button type="button" onClick={() => renderer.current?.zoom(1.25)} aria-label="Zoom out">−</button>
      <button type="button" onClick={() => renderer.current?.zoom(.8)} aria-label="Zoom in">+</button>
      <button type="button" onClick={() => renderer.current?.resetView()}>Fit candles</button>
    </div>}
    <p id="kairos-chart-help" className="kairos-analysis-chart__note">Drag sideways to pan. Pinch or use + / − to zoom. Hold to inspect. Keyboard: arrows, + / − and Home.</p>
  </>;
}
