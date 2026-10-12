import { useState, useCallback, useRef } from "react";
import type { EventSource } from "eventsource";
import { subscribeToStream } from "../../api/stream.js";
import type { PlanStep } from "../../api/stream.js";
import { createLogger } from "../../utils/logger.js";

export interface PendingClientTool {
  assignmentId: string;
  runId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

const log = createLogger("use-stream");

// ── Event shapes ────────────────────────────────────────────────────────────

export interface PlanCreatedEvent {
  kind: "plan.created";
  goal: string;
  steps: PlanStep[];
}

export interface StepReasoningEvent {
  kind: "step.reasoning";
  step_index: number;
  summary: string;
  content?: string | null;
}

export interface ToolCallEvent {
  kind: "tool.call";
  tool_name: string;
  args: Record<string, unknown>;
}

export interface ToolResultEvent {
  kind: "tool.result";
  tool_name: string;
  success: boolean;
  output_summary: string;
}

export interface MessageCreatedEvent {
  kind: "message.created";
  role: string;
  content: string;
}

export interface RunStatusEvent {
  kind: "run.status";
  status: string;
}

export interface RunCompletedEvent {
  kind: "run.completed";
  run_id: string;
  tokens_used?: number;
  cost_usd?: number;
}
export interface RunFailedEvent {
  kind: "run.failed";
  run_id: string;
  error: string;
}
export interface RunCancelledEvent {
  kind: "run.cancelled";
  run_id: string;
}

export interface RunStats {
  tokensUsed?: number;
  costUsd?: number;
}

export type StreamEvent =
  | PlanCreatedEvent
  | StepReasoningEvent
  | ToolCallEvent
  | ToolResultEvent
  | MessageCreatedEvent
  | RunStatusEvent
  | RunCompletedEvent
  | RunFailedEvent
  | RunCancelledEvent;

// ── Hook ────────────────────────────────────────────────────────────────────

export interface UseStreamResult {
  /** Events for the currently active (or most recent) turn. */
  streamEvents: StreamEvent[];
  /** All completed turns, each as an ordered array of events. */
  turns: StreamEvent[][];
  isStreaming: boolean;
  activeRunId: string | null;
  streamError: string | null;
  /** Token/cost stats from the last completed run (if the server provides them). */
  lastRunStats: RunStats | null;
  /**
   * Start streaming a new run.
   * @param userText  When provided, a synthetic user message event is
   *                  pre-injected so the prompt is immediately visible.
   */
  startStream: (
    streamPath: string,
    assignmentId: string,
    runId: string,
    userText?: string,
  ) => void;
  stopStream: () => void;
  /** Clears both current events and all accumulated turns. */
  clearEvents: () => void;
  /** Set when the server requests client-side tool execution (e.g. bash). */
  pendingClientTool: PendingClientTool | null;
  /** Call after posting the tool result to clear the pending state. */
  clearPendingClientTool: () => void;
}

export function useStream(): UseStreamResult {
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [turns, setTurns] = useState<StreamEvent[][]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [lastRunStats, setLastRunStats] = useState<RunStats | null>(null);
  const [pendingClientTool, setPendingClientTool] =
    useState<PendingClientTool | null>(null);

  const esRef = useRef<EventSource | null>(null);

  // Mirror of streamEvents accessible in the startStream closure without
  // requiring it as a dependency (avoids stale-closure issues).
  const streamEventsRef = useRef<StreamEvent[]>([]);

  const push = (event: StreamEvent) =>
    setStreamEvents((prev) => {
      const next = [...prev, event];
      streamEventsRef.current = next;
      return next;
    });

  const startStream = useCallback(
    (
      streamPath: string,
      assignmentId: string,
      runId: string,
      userText?: string,
    ) => {
      // Close any existing stream
      esRef.current?.close();
      esRef.current = null;

      // Archive the outgoing turn before starting a new one
      const outgoing = streamEventsRef.current;
      if (outgoing.length > 0) {
        setTurns((prev) => [...prev, outgoing]);
      }

      // Start fresh — pre-inject the user's message so it appears immediately
      const initialEvents: StreamEvent[] = userText
        ? [{ kind: "message.created", role: "user", content: userText }]
        : [];
      streamEventsRef.current = initialEvents;
      setStreamEvents(initialEvents);
      setIsStreaming(true);
      setActiveRunId(runId);
      setStreamError(null);

      log.info("Starting stream", { runId, streamPath });

      subscribeToStream(streamPath, {
        onRunStatus: (d) => push({ kind: "run.status", ...d }),
        onPlanCreated: (d) => push({ kind: "plan.created", ...d }),
        onStepReasoning: (d) => push({ kind: "step.reasoning", ...d }),
        onToolCall: (d) => push({ kind: "tool.call", ...d }),
        onToolResult: (d) => push({ kind: "tool.result", ...d }),
        onClientToolCall: (d) => {
          setPendingClientTool({
            assignmentId,
            runId,
            toolCallId: d.tool_call_id,
            toolName: d.tool_name,
            args: d.args,
          });
        },
        onMessageCreated: (d) => push({ kind: "message.created", ...d }),
        onRunCompleted: (d) => {
          push({ kind: "run.completed", ...d });
          if (d.tokens_used !== undefined || d.cost_usd !== undefined) {
            setLastRunStats({ tokensUsed: d.tokens_used, costUsd: d.cost_usd });
          }
        },
        onRunFailed: (d) => push({ kind: "run.failed", ...d }),
        onRunCancelled: (d) => push({ kind: "run.cancelled", ...d }),
        onError: (err) => {
          setStreamError(err.message);
          log.error("Stream error", { error: err.message });
        },
        onDone: () => {
          setIsStreaming(false);
          setActiveRunId(null);
          esRef.current = null;
          log.info("Stream completed", { runId });
        },
      })
        .then((es) => {
          esRef.current = es;
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          setStreamError(msg);
          setIsStreaming(false);
          log.error("Failed to subscribe to stream", { error: msg });
        });
    },
    [],
  );

  const stopStream = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setIsStreaming(false);
    setActiveRunId(null);
  }, []);

  const clearEvents = useCallback(() => {
    streamEventsRef.current = [];
    setStreamEvents([]);
    setTurns([]);
  }, []);

  const clearPendingClientTool = useCallback(() => {
    setPendingClientTool(null);
  }, []);

  return {
    streamEvents,
    turns,
    isStreaming,
    activeRunId,
    streamError,
    lastRunStats,
    startStream,
    stopStream,
    clearEvents,
    pendingClientTool,
    clearPendingClientTool,
  };
}
