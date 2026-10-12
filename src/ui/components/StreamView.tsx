import React from "react";
import { Box, Text } from "ink";
import { PlanBlock } from "./PlanBlock.js";
import { ToolCallRow } from "./ToolCallRow.js";
import { AssistantMessage } from "./AssistantMessage.js";
import type {
  StreamEvent,
  ToolCallEvent,
  ToolResultEvent,
} from "../hooks/useStream.js";

interface Props {
  events: StreamEvent[];
}

/**
 * Renders the accumulating SSE event stream in order:
 *   PlanBlock → ToolCallRow[] (with spinners / results) → AssistantMessage
 */
export function StreamView({ events }: Props) {
  if (events.length === 0) return null;

  // Build a map of tool_name → latest call+result for display
  // We track per-tool-call using order of appearance
  type ToolEntry = {
    event: ToolCallEvent;
    result?: ToolResultEvent;
  };
  const toolEntries: ToolEntry[] = [];

  let planEvent: Extract<StreamEvent, { kind: "plan.created" }> | null = null;
  let userMessage: Extract<StreamEvent, { kind: "message.created" }> | null =
    null;
  const assistantMessages: Extract<StreamEvent, { kind: "message.created" }>[] =
    [];

  for (const ev of events) {
    if (ev.kind === "plan.created") {
      planEvent = ev;
    } else if (ev.kind === "tool.call") {
      toolEntries.push({ event: ev });
    } else if (ev.kind === "tool.result") {
      // Match to the last unresolved tool call with same name
      const entry = [...toolEntries]
        .reverse()
        .find((e) => e.event.tool_name === ev.tool_name && !e.result);
      if (entry) entry.result = ev;
    } else if (ev.kind === "message.created") {
      if (ev.role === "user") {
        userMessage = ev;
      } else if (ev.role === "assistant") {
        assistantMessages.push(ev);
      }
    }
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {userMessage && (
        <Box marginBottom={1}>
          <Text bold color="cyan">
            ▸ You{" "}
          </Text>
          <Text>{userMessage.content}</Text>
        </Box>
      )}

      {planEvent && <PlanBlock goal={planEvent.goal} steps={planEvent.steps} />}

      {toolEntries.length > 0 && (
        <Box flexDirection="column" marginLeft={2} marginBottom={1}>
          {toolEntries.map((entry, i) => (
            <ToolCallRow
              key={i}
              toolName={entry.event.tool_name}
              result={
                entry.result
                  ? {
                      success: entry.result.success,
                      outputSummary: entry.result.output_summary,
                    }
                  : undefined
              }
            />
          ))}
        </Box>
      )}

      {assistantMessages.map((msg, i) => (
        <AssistantMessage key={i} content={msg.content} />
      ))}

      {events.some((e) => e.kind === "run.failed") && (
        <Box marginTop={1}>
          <Text color="red">
            ✗ Run failed:{" "}
            {
              (
                events.find((e) => e.kind === "run.failed") as
                  | { error: string }
                  | undefined
              )?.error
            }
          </Text>
        </Box>
      )}
    </Box>
  );
}
