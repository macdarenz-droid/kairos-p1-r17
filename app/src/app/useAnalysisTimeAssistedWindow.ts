import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LightweightChartsV5ProductionDrawingBindingLifecycle } from '../features/chart/lightweightChartsV5ProductionRenderer';
import { createAnalysisTimeAssistedWindowSession, type AnalysisTimeAssistedWindowRange, type AnalysisTimeAssistedWindowResult, type AnalysisTimeAssistedWindowSession } from './analysisTimeAssistedWindowSession';

export interface AnalysisTimeAssistedWindowBinding {
  /** Hand this to the drawing-tools hook so both chart paths carry it into the production renderer beside the drawing lifecycle. */
  readonly lifecycle: LightweightChartsV5ProductionDrawingBindingLifecycle;
  readonly last: AnalysisTimeAssistedWindowResult | null;
  show(range: AnalysisTimeAssistedWindowRange): AnalysisTimeAssistedWindowResult;
}

const inertLifecycle: LightweightChartsV5ProductionDrawingBindingLifecycle = Object.freeze({ attach() { /* no selection */ }, detach() { /* no selection */ } });

/** One window session per exact Analysis selection key; the last navigation result is kept for the preview. */
export function useAnalysisTimeAssistedWindow(key: string | null, createSession: () => AnalysisTimeAssistedWindowSession = createAnalysisTimeAssistedWindowSession): AnalysisTimeAssistedWindowBinding {
  const [last, setLast] = useState<AnalysisTimeAssistedWindowResult | null>(null);
  const session = useMemo(() => (key === null ? null : createSession()), [key, createSession]);
  useEffect(() => { setLast(null); if (session === null) return; return () => { session.destroy(); }; }, [session]);
  const show = useCallback((range: AnalysisTimeAssistedWindowRange): AnalysisTimeAssistedWindowResult => {
    const result: AnalysisTimeAssistedWindowResult = session === null ? Object.freeze({ kind: 'pending-chart' as const }) : session.show(range);
    setLast(result);
    if (result.kind === 'shown' && session !== null && typeof requestAnimationFrame === 'function') {
      // The vendor applies the target range on its next frame; report what it actually shows then.
      requestAnimationFrame(() => { setLast(current => (current === result ? Object.freeze({ ...result, visible: session.visibleRange() }) : current)); });
    }
    return result;
  }, [session]);
  return { lifecycle: session === null ? inertLifecycle : session.lifecycle, last, show };
}
