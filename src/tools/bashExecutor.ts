import { spawn } from "child_process";
import { z } from "zod";
import type {
  ClientTool,
  ToolExecutionResult,
  ToolExecuteOptions,
} from "./types.js";

const BashInputSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeout_ms: z.number().int().positive().optional(),
});

type BashInput = z.infer<typeof BashInputSchema>;

async function executeBash(
  input: BashInput,
  opts?: ToolExecuteOptions,
): Promise<ToolExecutionResult> {
  const { command, cwd, timeout_ms = 30000 } = input;

  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", command], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const settle = (result: ToolExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      resolve(result);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      opts?.onProgress?.(text);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // SIGTERM first; SIGKILL after 5s grace if the process doesn't exit
    const killTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, 5000);
    }, timeout_ms);

    child.on("close", (code) => {
      if (timedOut) {
        settle({
          success: false,
          output: { stdout, stderr, exit_code: -1, command },
          error: `Command timed out after ${timeout_ms}ms`,
        });
        return;
      }
      const exit_code = code ?? 0;
      settle({
        success: exit_code === 0,
        output: { stdout, stderr, exit_code, command },
        error:
          exit_code !== 0 ? `Command exited with code ${exit_code}` : undefined,
      });
    });

    child.on("error", (err) => {
      settle({
        success: false,
        output: { stdout, stderr, exit_code: -1, command },
        error: err.message,
      });
    });
  });
}

export const BashTool: ClientTool<typeof BashInputSchema> = {
  name: "bash",
  description: "Execute a shell command. Requires user approval.",
  inputSchema: BashInputSchema,
  requiresApproval: true,
  isReadOnly: false,
  execute: executeBash,
};
