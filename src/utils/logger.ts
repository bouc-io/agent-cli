/**
 * Structured JSON logger — writes to stderr only so Ink owns stdout.
 *
 * Required fields per bouc.io logging standard:
 *   timestamp, level, agent, message, component, elapsed_ms
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  agent: string;
  component: string;
  message: string;
  elapsed_ms?: number;
  [key: string]: unknown;
}

const AGENT = "agent-cli";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// In an interactive terminal Ink owns stdout; raw JSON on stderr bleeds through visibly.
// Enforce a minimum of 'warn' when running interactively so info/debug stay silent.
const MIN_LEVEL: LogLevel = (() => {
  const configured = (process.env.LOG_LEVEL ?? "info") as LogLevel;
  if (process.stdout.isTTY && LEVEL_ORDER[configured] < LEVEL_ORDER["warn"]) {
    return "warn";
  }
  return configured;
})();

function write(
  level: LogLevel,
  component: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  if ((LEVEL_ORDER[level] ?? 0) < (LEVEL_ORDER[MIN_LEVEL] ?? 1)) return;
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    agent: AGENT,
    component,
    message,
    ...extra,
  };
  process.stderr.write(JSON.stringify(entry) + "\n");
}

export interface Logger {
  debug(message: string, extra?: Record<string, unknown>): void;
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
}

export function createLogger(component: string): Logger {
  return {
    debug: (msg, extra) => write("debug", component, msg, extra),
    info: (msg, extra) => write("info", component, msg, extra),
    warn: (msg, extra) => write("warn", component, msg, extra),
    error: (msg, extra) => write("error", component, msg, extra),
  };
}
