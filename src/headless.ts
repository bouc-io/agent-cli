/**
 * Non-interactive (headless) mode — usable from scripts or CI.
 *
 * Usage: agent-cli --prompt "What time is it?"
 *
 * Each invocation automatically creates a fresh assignment (session).
 * Exits 0 on run.completed, exits 1 on run.failed or any error.
 */
import type { Config } from "./config/config.js";
import { getStoredToken, AuthExpiredError } from "./config/auth.js";
import { initClient, postToolResult } from "./api/client.js";
import { getClientTool } from "./tools/registry.js";
import { createAssignment } from "./api/assignments.js";
import { createMessage } from "./api/messages.js";
import { subscribeToStream } from "./api/stream.js";
import type { PlanStep } from "./api/stream.js";

export async function runHeadless(
  prompt: string,
  config: Config,
): Promise<void> {
  const token = await getStoredToken();
  if (!token) {
    process.stderr.write("Not authenticated. Run `agent-cli /login` first.\n");
    process.exit(1);
  }

  initClient(config);

  let assignmentId: string;
  try {
    const a = await createAssignment(`Headless ${new Date().toISOString()}`);
    assignmentId = a.id;
  } catch (err) {
    process.stderr.write(
      `Failed to create session: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }

  let streamPath: string;
  let runId: string;
  try {
    const { run } = await createMessage(assignmentId, prompt);
    streamPath = run.stream_url;
    runId = run.id;
  } catch (err) {
    if (err instanceof AuthExpiredError) {
      process.stderr.write("Session expired. Run `agent-cli /login`.\n");
      process.exit(1);
    }
    process.stderr.write(
      `Failed to create message: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }

  await new Promise<void>((resolve, reject) => {
    subscribeToStream(streamPath, {
      onRunStatus: (d) => {
        if (d.status !== "queued")
          process.stdout.write(`[status] ${d.status}\n`);
      },
      onPlanCreated: (d: { goal: string; steps: PlanStep[] }) => {
        process.stdout.write(`[plan] ${d.goal}\n`);
        for (const step of d.steps) {
          process.stdout.write(`  ${step.id}. ${step.description}\n`);
        }
      },
      onToolCall: (d) => {
        process.stdout.write(`[tool] ${d.tool_name}\n`);
      },
      onToolResult: (d) => {
        const icon = d.success ? "✓" : "✗";
        process.stdout.write(
          `[tool:${icon}] ${d.tool_name}: ${d.output_summary}\n`,
        );
      },
      onClientToolCall: (d) => {
        const tool = getClientTool(d.tool_name);

        if (!tool) {
          process.stderr.write(
            `[tool:rejected] ${d.tool_name} — unknown client tool\n`,
          );
          void postToolResult(assignmentId, runId, d.tool_call_id, {
            success: false,
            output: {},
            error: `Unknown client tool: ${d.tool_name}`,
          });
          return;
        }

        if (d.tool_name === "ask_user") {
          // In headless mode: pick the first option if available, otherwise reject
          const options = d.args.options as string[] | undefined;
          if (options && options.length > 0) {
            process.stderr.write(
              `[tool:auto-answer] ask_user — picking first option: "${options[0]}"\n`,
            );
            void postToolResult(assignmentId, runId, d.tool_call_id, {
              success: true,
              output: { answer: options[0] },
            });
          } else {
            process.stderr.write(
              "[tool:rejected] ask_user — requires interactive CLI; no options to auto-select\n",
            );
            void postToolResult(assignmentId, runId, d.tool_call_id, {
              success: false,
              output: {},
              error:
                "ask_user requires interactive CLI; headless mode cannot answer free-text questions",
            });
          }
          return;
        }

        if (tool.requiresApproval) {
          // Interactive approval is unavailable in headless mode — auto-reject
          process.stderr.write(
            `[tool:rejected] ${d.tool_name} — requires interactive CLI; headless mode auto-rejects\n`,
          );
          void postToolResult(assignmentId, runId, d.tool_call_id, {
            success: false,
            output: {},
            error: `${d.tool_name} requires interactive CLI approval; headless mode auto-rejects`,
          });
          return;
        }

        // Read-only tools — execute automatically
        process.stderr.write(`[tool:auto] ${d.tool_name}\n`);
        void (async () => {
          try {
            const input = tool.inputSchema.parse(d.args) as Record<
              string,
              unknown
            >;
            const result = await tool.execute(input);
            await postToolResult(assignmentId, runId, d.tool_call_id, result);
          } catch (err) {
            await postToolResult(assignmentId, runId, d.tool_call_id, {
              success: false,
              output: {},
              error: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
        })();
      },
      onMessageCreated: (d) => {
        if (d.role === "assistant") {
          process.stdout.write(d.content + "\n");
        }
      },
      onRunCompleted: () => {
        resolve();
      },
      onRunFailed: (d) => {
        process.stderr.write(`Run failed: ${d.error}\n`);
        reject(new Error(d.error));
      },
      onRunCancelled: () => {
        process.stderr.write("Run cancelled.\n");
        reject(new Error("cancelled"));
      },
      onError: (err) => {
        process.stderr.write(`Stream error: ${err.message}\n`);
        reject(err);
      },
    })
      .then((es) => {
        void es;
      })
      .catch(reject);
  }).catch((err: unknown) => {
    process.stderr.write(
      `Error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });

  process.exit(0);
}
