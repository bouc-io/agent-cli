import type { ClientTool } from "./types.js";
import { BashTool } from "./bashExecutor.js";
import {
  ReadFileTool,
  WriteFileTool,
  GlobFilesTool,
  ListDirTool,
} from "./fileSystemExecutors.js";
import { GrepFilesTool } from "./grepExecutor.js";
import { FileEditTool } from "./fileEditExecutor.js";
import { WebFetchTool } from "./webFetchExecutor.js";
import { FileDeleteTool, FileMoveTool } from "./fileManagementExecutors.js";
import { ProcessListTool } from "./processExecutor.js";
import { AskUserTool } from "./askUserTool.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, ClientTool<any>>();

function register(tool: ClientTool): void {
  registry.set(tool.name, tool);
}

register(BashTool);
register(ReadFileTool);
register(WriteFileTool);
register(GlobFilesTool);
register(ListDirTool);
register(GrepFilesTool);
register(FileEditTool);
// str_replace_file is a common LLM alias for file_edit
registry.set("str_replace_file", { ...FileEditTool, name: "str_replace_file" });
register(WebFetchTool);
register(FileDeleteTool);
register(FileMoveTool);
register(ProcessListTool);
register(AskUserTool);

export function getClientTool(name: string): ClientTool | undefined {
  return registry.get(name);
}

export function isClientTool(name: string): boolean {
  return registry.has(name);
}

/** Returns the deduplicated list of registered tools (aliases excluded). */
export function listClientTools(): ClientTool[] {
  const seen = new Set<ClientTool>();
  for (const tool of registry.values()) {
    // str_replace_file is an alias — point back to the canonical FileEditTool
    const canonical = tool.name === "str_replace_file" ? FileEditTool : tool;
    seen.add(canonical);
  }
  return [...seen];
}
