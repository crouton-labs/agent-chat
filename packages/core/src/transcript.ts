// transcript.ts — the pure, framework-free reducer that folds a broker's
// `welcome.snapshot` + streamed `AgentSessionEvent`s into raw pi-message state
// (spec §3 "Streaming invariant"): pi sends whole messages, never token deltas,
// so a `message_update` REPLACES the in-progress message wholesale. `useAgentChat`
// runs `normalizeMessages` over the result to produce the rendered `ChatItem[]`.

import type { AgentSessionEvent, AnyMessage, BrokerSnapshot } from './wire/protocol.js';

export interface ConvState {
  /** The full ordered transcript (snapshot history + streamed messages). */
  messages: AnyMessage[];
  /** Index of the assistant message currently streaming, or null. */
  streamingIndex: number | null;
  /** True between `agent_start` and `agent_end`. */
  isStreaming: boolean;
}

export function initialConvState(): ConvState {
  return { messages: [], streamingIndex: null, isStreaming: false };
}

/** Seed state from the broker's catch-up snapshot. Called on EVERY (re)connect —
 *  a fresh `welcome` replaces transcript state wholesale (no dedup/merge, spec
 *  §9/§15): the snapshot is authoritative, so re-seeding on reconnect never
 *  duplicates history. */
export function applySnapshot(snapshot: BrokerSnapshot): ConvState {
  return {
    messages: [...snapshot.messages],
    streamingIndex: null,
    isStreaming: snapshot.state?.isStreaming === true,
  };
}

function roleOf(m: AnyMessage): string {
  return (m as { role?: string }).role ?? '';
}

/** Apply one pi `AgentSessionEvent` to the transcript. Broker control frames
 *  (welcome/control_changed/display_status/extension_ui_request/…) are NOT
 *  folded here — only pi agent events reach this function (spec §3). */
export function reduce(state: ConvState, event: AgentSessionEvent): ConvState {
  switch (event.type) {
    case 'agent_start':
      return { ...state, isStreaming: true };

    case 'agent_end':
      return { ...state, isStreaming: false, streamingIndex: null };

    case 'message_start': {
      const messages = [...state.messages, event.message];
      const isAssistant = roleOf(event.message) === 'assistant';
      return { ...state, messages, streamingIndex: isAssistant ? messages.length - 1 : state.streamingIndex };
    }

    case 'message_update': {
      // Only assistant messages stream. If we attached mid-stream (no
      // message_start observed on this connection), adopt the last message
      // when it is the assistant currently being streamed.
      let idx = state.streamingIndex;
      if (idx === null) {
        const last = state.messages.length - 1;
        if (last >= 0 && roleOf(state.messages[last]!) === 'assistant') idx = last;
      }
      if (idx === null) return state;
      const messages = [...state.messages];
      messages[idx] = event.message;
      return { ...state, messages, streamingIndex: idx };
    }

    case 'message_end': {
      if (state.streamingIndex === null) return state;
      const messages = [...state.messages];
      messages[state.streamingIndex] = event.message;
      return { ...state, messages, streamingIndex: null };
    }

    default:
      return state;
  }
}
