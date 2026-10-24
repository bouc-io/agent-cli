import type { Config } from "../config/config.js";
import type { Assignment } from "../api/assignments.js";
import { listClientTools } from "../tools/registry.js";
import { listMessages } from "../api/messages.js";
import { cancelRun } from "../api/runs.js";
import { apiGet } from "../api/client.js";
import {
  performLogin,
  clearTokens,
  getStoredToken,
  decodeJwtPayload,
} from "../config/auth.js";
import type { HistoryMessage } from "../ui/components/MessageList.js";

// ── Context passed from App ──────────────────────────────────────────────────

export interface SlashContext {
  config: Config;
  assignment: Assignment | null;
  activeRunId: string | null;
  stopStream: () => void;
  /** Start a fresh session (creates a new assignment internally). */
  newSession: () => Promise<void>;
  onStatusMessage: (msg: string) => void;
  onHistory: (messages: HistoryMessage[]) => void;
  onUsernameChange: (name: string | undefined) => void;
  exit: () => void;
}

export interface SlashResult {
  message?: string;
}

// ── Tool list helper ─────────────────────────────────────────────────────────

interface Tool {
  name: string;
  description: string;
  enabled: boolean;
  requires_client_execution?: boolean;
}

interface ToolsListResponse {
  data: Tool[];
  pagination: { total: number };
}

// ── Health helper ────────────────────────────────────────────────────────────

interface HealthStatus {
  status: string;
  services?: Record<string, { status: string; message?: string }>;
}

// ── Main dispatcher ──────────────────────────────────────────────────────────

/**
 * Dispatch a slash command. Returns a result object or throws on error.
 */
export async function handleSlashCommand(
  input: string,
  ctx: SlashContext,
): Promise<SlashResult> {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    // ── /login ───────────────────────────────────────────────────────────
    case "/login": {
      ctx.onStatusMessage("Opening browser for login…");
      const result = await performLogin(ctx.config);
      ctx.onUsernameChange(result.username);
      return { message: `✓ Logged in as: ${result.username}` };
    }

    // ── /logout ──────────────────────────────────────────────────────────
    case "/logout": {
      await clearTokens();
      ctx.onUsernameChange(undefined);
      return { message: "✓ Logged out — tokens cleared" };
    }

    // ── /debug-token ─────────────────────────────────────────────────────
    case "/debug-token": {
      const token = await getStoredToken();
      if (!token)
        return { message: "No token stored — type /login to authenticate" };
      const p = decodeJwtPayload(token);
      const exp = p.exp
        ? new Date((p.exp as number) * 1000).toLocaleString()
        : "unknown";
      const audRaw = p.aud;
      const audList: string[] = Array.isArray(audRaw)
        ? (audRaw as string[])
        : audRaw != null
          ? [String(audRaw)]
          : [];
      const audStr = audList.length ? audList.join(", ") : "none";
      const hasProxy = audList.includes("oauth2-proxy");
      const lines = [
        "JWT claims:",
        `  preferred_username : ${p.preferred_username ?? "not set"}`,
        `  aud                : [${audStr}]`,
        `  iss                : ${p.iss ?? "not set"}`,
        `  exp                : ${exp}`,
        "",
        hasProxy
          ? "✓ aud includes 'oauth2-proxy' — OAuth2-Proxy will accept this token"
          : "✗ aud does NOT include 'oauth2-proxy' — this causes HTML redirect errors\n  Fix: add an Audience mapper to the 'agent-cli' Keycloak client\n       (included.client.audience = oauth2-proxy), then /login again",
      ];
      return { message: lines.join("\n") };
    }

    // ── /help ────────────────────────────────────────────────────────────
    case "/help": {
      const lines = [
        "Available commands:",
        "  /login          Authenticate via browser (OAuth PKCE)",
        "  /logout         Remove stored credentials",
        "  /help           Show this help",
        "  /clear          Clear the screen",
        "  /history [n]    Show last n messages in this session (default: 20)",
        "  /new            Start a fresh session",
        "  /tools          List client-side and server-side tools",
        "  /status         Check server health",
        "  /cancel         Cancel the active run",
        "  /debug-token    Decode current JWT and diagnose auth issues",
        "  /exit           Exit the CLI",
      ];
      return { message: lines.join("\n") };
    }

    // ── /clear ───────────────────────────────────────────────────────────
    case "/clear": {
      process.stdout.write("\x1Bc");
      return {};
    }

    // ── /history ─────────────────────────────────────────────────────────
    case "/history": {
      if (!ctx.assignment) {
        return { message: "No active session." };
      }
      const limit = args[0] ? parseInt(args[0], 10) : 20;
      const resp = await listMessages(ctx.assignment.id, limit);
      // API returns newest-first; reverse for chronological display
      const messages: HistoryMessage[] = resp.data
        .slice()
        .reverse()
        .map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
        }));
      ctx.onHistory(messages);
      return {};
    }

    // ── /new ─────────────────────────────────────────────────────────────
    case "/new": {
      await ctx.newSession();
      return { message: "✓ New session started." };
    }

    // ── /tools ───────────────────────────────────────────────────────────
    case "/tools": {
      const lines: string[] = [];

      // Client-side tools (always available, no server needed)
      const clientTools = listClientTools();
      lines.push(`Client tools (${clientTools.length}):`);
      for (const t of clientTools) {
        const flag = t.requiresApproval ? " [approval]" : " [auto]   ";
        const desc =
          t.description.length > 55
            ? t.description.slice(0, 52) + "…"
            : t.description;
        lines.push(`  ${t.name.padEnd(20)}${flag} ${desc}`);
      }

      // Server-side tools (fetched from API)
      try {
        const resp = await apiGet<ToolsListResponse>("/v1/tools");
        const serverTools = resp.data.filter((t) => t.enabled);
        lines.push("");
        lines.push(`Server tools (${serverTools.length}):`);
        for (const t of serverTools) {
          const flag = t.requires_client_execution
            ? " [local]  "
            : " [server] ";
          const desc =
            t.description.length > 55
              ? t.description.slice(0, 52) + "…"
              : t.description;
          lines.push(`  ${t.name.padEnd(20)}${flag} ${desc}`);
        }
      } catch {
        lines.push("  (server tools unavailable — not connected)");
      }

      return { message: lines.join("\n") };
    }

    // ── /status ──────────────────────────────────────────────────────────
    case "/status": {
      const health = await apiGet<HealthStatus>("/health/detailed");
      const lines = [`Status: ${health.status}`];
      if (health.services) {
        for (const [name, svc] of Object.entries(health.services)) {
          const ok = svc.status === "ok" || svc.status === "healthy";
          lines.push(
            `  ${ok ? "✓" : "✗"} ${name}: ${svc.status}${svc.message ? ` — ${svc.message}` : ""}`,
          );
        }
      }
      return { message: lines.join("\n") };
    }

    // ── /cancel ──────────────────────────────────────────────────────────
    case "/cancel": {
      if (!ctx.activeRunId) return { message: "No active run to cancel." };
      if (!ctx.assignment) return { message: "No active session." };
      ctx.stopStream();
      await cancelRun(ctx.assignment.id, ctx.activeRunId);
      return { message: "✓ Cancel requested." };
    }

    // ── /exit ────────────────────────────────────────────────────────────
    case "/exit":
    case "/quit": {
      ctx.exit();
      return {};
    }

    // ── Unknown ──────────────────────────────────────────────────────────
    default:
      return {
        message: `Unknown command: ${cmd}. Type /help for available commands.`,
      };
  }
}
