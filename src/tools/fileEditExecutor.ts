import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { ClientTool, ToolExecutionResult } from "./types.js";

const FileEditInputSchema = z.object({
  path: z.string().min(1),
  old_string: z.string().min(1),
  new_string: z.string(),
});

export type FileEditInput = z.infer<typeof FileEditInputSchema>;

export async function executeFileEdit(
  input: FileEditInput,
): Promise<ToolExecutionResult> {
  const { path: filePath, old_string, new_string } = input;
  const resolved = resolve(filePath);

  try {
    const original = await readFile(resolved, "utf8");
    const occurrences = original.split(old_string).length - 1;

    if (occurrences === 0) {
      return {
        success: false,
        output: { path: resolved },
        error: `old_string not found in ${filePath} — the string must match exactly (including whitespace and line endings)`,
      };
    }
    if (occurrences > 1) {
      return {
        success: false,
        output: { path: resolved, occurrences },
        error: `old_string matches ${occurrences} locations in ${filePath} — it must be unique; add more surrounding context to disambiguate`,
      };
    }

    const updated = original.replace(old_string, new_string);
    await writeFile(resolved, updated, "utf8");

    return {
      success: true,
      output: { path: resolved },
    };
  } catch (err) {
    return {
      success: false,
      output: { path: resolved },
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const FileEditTool: ClientTool<typeof FileEditInputSchema> = {
  name: "file_edit",
  description:
    "Replace an exact unique string in a file. old_string must match exactly once. Requires user approval.",
  inputSchema: FileEditInputSchema,
  requiresApproval: true,
  isReadOnly: false,
  execute: executeFileEdit,
};
