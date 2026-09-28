import {
  createLiveMarketSummaryDeliveryState,
  type LiveMarketSummaryDeliveryState,
} from './liveMarketSummaryDeliveryState';

export type LiveMarketSummaryStateTransition = (
  state: LiveMarketSummaryDeliveryState,
) => Promise<LiveMarketSummaryDeliveryState>;

export interface LiveMarketSummaryStateSession {
  getState(): LiveMarketSummaryDeliveryState;
  transition(
    transitionState: LiveMarketSummaryStateTransition,
  ): Promise<LiveMarketSummaryDeliveryState>;
}

/**
 * Provider-neutral in-memory owner for exactly one current released
 * LiveMarketSummaryDeliveryState. All transitions are explicit and
 * caller-driven. This owner adds no acquisition, freshness, polling,
 * persistence, scheduling, ranking, UI-reactivity, or provider policy.
 */
export function createLiveMarketSummaryStateSession(
  initialState: LiveMarketSummaryDeliveryState = createLiveMarketSummaryDeliveryState(),
): LiveMarketSummaryStateSession {
  let currentState = initialState;

  return {
    getState(): LiveMarketSummaryDeliveryState {
      return currentState;
    },
    async transition(
      transitionState: LiveMarketSummaryStateTransition,
    ): Promise<LiveMarketSummaryDeliveryState> {
      const nextState = await transitionState(currentState);
      currentState = nextState;
      return currentState;
    },
  };
}
