import type { z } from "zod";

export interface ToolExecutionResult {
  success: boolean;
  output: Record<string, unknown>;
  error?: string;
}

export interface ToolExecuteOptions {
  /** Called with each stdout chunk for tools that stream output (e.g. bash). */
  onProgress?: (chunk: string) => void;
}

export interface ClientTool<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: TInput;
  /** Destructive / write tools require explicit user approval before execution. */
  requiresApproval: boolean;
  /** Read-only tools are auto-executed without prompting. */
  isReadOnly: boolean;
  execute(
    input: z.infer<TInput>,
    opts?: ToolExecuteOptions,
  ): Promise<ToolExecutionResult>;
}
