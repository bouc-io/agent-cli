import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import fg from "fast-glob";
import { z } from "zod";
import type { ClientTool, ToolExecutionResult } from "./types.js";

// ── read_file ─────────────────────────────────────────────────────────────────

const ReadFileInputSchema = z.object({
  path: z.string().min(1),
  encoding: z.string().optional(),
});

async function executeReadFile(
  input: z.infer<typeof ReadFileInputSchema>,
): Promise<ToolExecutionResult> {
  const resolved = resolve(input.path);
  const encoding = (input.encoding ?? "utf8") as BufferEncoding;
  try {
    const content = await readFile(resolved, { encoding });
    const s = await stat(resolved);
    return {
      success: true,
      output: { path: resolved, content, size_bytes: s.size, encoding },
    };
  } catch (err) {
    return {
      success: false,
      output: { path: resolved, content: "", size_bytes: 0, encoding },
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const ReadFileTool: ClientTool<typeof ReadFileInputSchema> = {
  name: "read_file",
  description: "Read the contents of a file.",
  inputSchema: ReadFileInputSchema,
  requiresApproval: false,
  isReadOnly: true,
  execute: executeReadFile,
};

// ── write_file ────────────────────────────────────────────────────────────────

const WriteFileInputSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  create_dirs: z.boolean().optional(),
});

async function executeWriteFile(
  input: z.infer<typeof WriteFileInputSchema>,
): Promise<ToolExecutionResult> {
  const resolved = resolve(input.path);
  try {
    if (input.create_dirs) {
      await mkdir(dirname(resolved), { recursive: true });
    }
    await writeFile(resolved, input.content, "utf8");
    const s = await stat(resolved);
    return {
      success: true,
      output: { path: resolved, bytes_written: s.size },
    };
  } catch (err) {
    return {
      success: false,
      output: { path: resolved, bytes_written: 0 },
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const WriteFileTool: ClientTool<typeof WriteFileInputSchema> = {
  name: "write_file",
  description: "Write content to a file. Requires user approval.",
  inputSchema: WriteFileInputSchema,
  requiresApproval: true,
  isReadOnly: false,
  execute: executeWriteFile,
};

// ── glob_files ────────────────────────────────────────────────────────────────

const GlobFilesInputSchema = z.object({
  pattern: z.string().min(1),
  cwd: z.string().optional(),
});

async function executeGlobFiles(
  input: z.infer<typeof GlobFilesInputSchema>,
): Promise<ToolExecutionResult> {
  const resolvedCwd = input.cwd ? resolve(input.cwd) : process.cwd();
  try {
    const matches = await fg(input.pattern, { cwd: resolvedCwd, dot: true });
    return {
      success: true,
      output: {
        pattern: input.pattern,
        cwd: resolvedCwd,
        matches,
        count: matches.length,
      },
    };
  } catch (err) {
    return {
      success: false,
      output: {
        pattern: input.pattern,
        cwd: resolvedCwd,
        matches: [],
        count: 0,
      },
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const GlobFilesTool: ClientTool<typeof GlobFilesInputSchema> = {
  name: "glob_files",
  description: "Find files matching a glob pattern.",
  inputSchema: GlobFilesInputSchema,
  requiresApproval: false,
  isReadOnly: true,
  execute: executeGlobFiles,
};

// ── list_dir ──────────────────────────────────────────────────────────────────

const ListDirInputSchema = z.object({
  path: z.string().min(1),
  show_hidden: z.boolean().optional(),
});

interface DirEntry {
  name: string;
  type: "file" | "directory" | "symlink" | "other";
  size_bytes: number;
  modified_at: string;
}

async function executeListDir(
  input: z.infer<typeof ListDirInputSchema>,
): Promise<ToolExecutionResult> {
  const resolved = resolve(input.path);
  const showHidden = input.show_hidden ?? false;
  try {
    const names = await readdir(resolved);
    const entries: DirEntry[] = [];
    for (const name of names) {
      if (!showHidden && name.startsWith(".")) continue;
      const s = await stat(join(resolved, name));
      let type: DirEntry["type"] = "other";
      if (s.isFile()) type = "file";
      else if (s.isDirectory()) type = "directory";
      else if (s.isSymbolicLink()) type = "symlink";
      entries.push({
        name,
        type,
        size_bytes: s.isFile() ? s.size : 0,
        modified_at: s.mtime.toISOString(),
      });
    }
    return {
      success: true,
      output: { path: resolved, entries, count: entries.length },
    };
  } catch (err) {
    return {
      success: false,
      output: { path: resolved, entries: [], count: 0 },
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const ListDirTool: ClientTool<typeof ListDirInputSchema> = {
  name: "list_dir",
  description: "List the contents of a directory.",
  inputSchema: ListDirInputSchema,
  requiresApproval: false,
  isReadOnly: true,
  execute: executeListDir,
};
