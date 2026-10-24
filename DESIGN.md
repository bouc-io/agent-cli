# agent-cli Design Document

## 1. Overview

`agent-cli` is a terminal-based client for the bouc.io AI assistant platform. It provides an interactive REPL experience — inspired by the [Gemini CLI](https://github.com/google-gemini/gemini-cli) — that lets users converse with the AI agent, observe real-time tool execution, and manage conversations, all from the command line.

It is a **fourth client** in the ecosystem alongside:
- `monochrome-chatbot-ui` — simple chat web UI
- `monochrome-agent-ui` — agentic task web UI with tool visibility
- `monochrome-memory-ui` — memory management web UI

The CLI can be installed globally on macOS (and Linux) and used independently of any browser.

---

## 2. Architecture Decision: agent-api-server vs. Ollama Direct

### Recommendation: Call `agent-api-server`

The CLI is a **thin client** to `agent-api-server`. It does not embed an LLM or re-implement agent logic.

```
agent-cli (local)
     │
     │  REST + SSE (HTTP/HTTPS)
     ▼
agent-api-server  ──▶  Ollama (LLM)
     │                  ├── Planner phase
     │                  └── Executor phase (tool loop)
     ├──▶  memory-api-server  (pgvector retrieval)
     └──▶  memory-distiller   (post-run memory classification)
```

### Why not Ollama directly?

| Concern | agent-api-server | Ollama direct |
|---|---|---|
| Two-phase Planner→Executor | Already implemented | Must rewrite |
| Memory (retrieval + distillation) | Auto-wired | Not available |
| Conversation persistence | Assignments + messages in PostgreSQL | None |
| SSE streaming | Implemented via Redis pub/sub | Must implement |
| Multi-client (CLI + web UI share session) | Yes — same assignment | No |
| Server-side tools (web_search, calculator…) | Available immediately | Must reimplement |
| Auth & multi-user | Handled server-side | Not available |

Calling Ollama directly would duplicate the entire agent-api-server codebase in the CLI for no user-facing benefit. The agent-api-server already solves all these problems.

---

## 3. Interaction Flow

### 3.1 Startup

```
$ agent-cli

  Connecting to https://agent.pik8s.internal ... ✓
  Logged in as: martin
  Assignment: "CLI Session 2026-02-24" (new)

> _
```

On startup the CLI:
1. Reads config from `~/.config/agent-cli/config.json`
2. Validates the auth token (calls `GET /health/detailed`)
3. Creates or resumes an assignment (conversation session)
4. Opens the interactive prompt

### 3.2 Per-message Flow

```
User types: "Search for the latest Node.js LTS release"
                    │
                    ▼
POST /v1/assignments/:id/messages
  { content: "Search for the latest Node.js LTS release" }
                    │
          ← 202 { run: { id, stream_url } }
                    │
                    ▼
GET /v1/assignments/:id/runs/:runId/stream   (SSE)
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
plan.created    tool.call       tool.result
(show steps)  (show spinner)  (show result)
                                    │
                              run.completed
                           (render final answer)
```

### 3.3 SSE Event Rendering

The CLI subscribes to the SSE stream and renders events progressively in the terminal:

| SSE Event | CLI Display |
|---|---|
| `plan.created` | Collapsible plan block with numbered steps |
| `step.reasoning` | Dimmed italic reasoning text |
| `tool.call` | `⚙ Calling web_search { query: "..." }` spinner |
| `tool.result` | `✓ web_search → 5 results` (collapsed, expandable) |
| `message.created` (assistant) | Final answer rendered with markdown |
| `run.completed` | Prompt restored |
| `run.failed` | Error message in red |
| `run.cancelled` | Cancellation notice |

---

## 4. Tool Set

### 4.1 MVP (Phase 1) — Server-side tools via agent-api-server

The CLI inherits all tools already registered in the agent-api-server without any additional code:

| Tool | Description |
|---|---|
| `echo` | Echoes a message — used for testing |
| `web_search` | DuckDuckGo search with scraping fallback |
| `calculator` | Safe math evaluation via mathjs |
| `time_date` | Timezone conversion, date arithmetic, formatting |
| `http_request` | HTTP calls to pre-configured or arbitrary APIs |

### 4.2 Phase 2 — Local tools (client-intercept protocol)

Phase 2 adds tools that execute on the **CLI machine** (not the server). This requires a client-intercept protocol:

**Protocol:**
1. A new DB flag `requires_client_execution: true` marks client-side tools
2. When the executor reaches such a tool, it pauses and emits:
   ```
   event: tool.call
   data: { "type": "tool.call", "tool_name": "bash", "client_side": true, "tool_input": {...} }
   ```
3. The CLI intercepts this event, executes the tool locally
4. CLI POSTs the result: `POST /v1/assignments/:aid/runs/:rid/tool-results`
   ```json
   { "tool_call_id": "uuid", "output": { "stdout": "...", "exit_code": 0 } }
   ```
5. Server resumes the executor loop with the client-provided result

**Phase 2 tools:**

| Tool | Description |
|---|---|
| `bash` | Execute shell commands in the user's working directory |
| `read_file` | Read file contents (text or binary metadata) |
| `write_file` | Create or overwrite files |
| `glob_files` | Find files matching a pattern |
| `list_dir` | List directory contents with metadata |

The `bash` tool mirrors Gemini CLI's `shell` tool — the LLM can read files, run scripts, manipulate directories, and chain shell commands.

---

## 5. Inspiration from Gemini CLI

The following patterns from [Gemini CLI](https://github.com/google-gemini/gemini-cli) are adopted:

| Pattern | Gemini CLI | agent-cli |
|---|---|---|
| Terminal UI framework | Ink (React for terminal) | Ink |
| Streaming rendering | `useGeminiStream()` hook + React state | SSE EventSource + Ink state |
| Config file | `~/.gemini/settings.json` | `~/.config/agent-cli/config.json` |
| Installation | `npm install -g` / `npx` | `npm install -g` / `npx` |
| Slash commands | `/help`, `/clear`, `/history` | `/help`, `/clear`, `/history`, `/assignment` |
| Non-interactive mode | `--prompt "..."` flag | `--prompt "..."` flag |
| Session context file | `GEMINI.md` | `AGENT.md` (inject into assignment system prompt) |
| Tool confirmation | Approval mode dialog | Show tool input, confirm with `y/n` for sensitive tools |

**What is NOT adopted:**
- MCP server integration (agent-api-server's tool registry replaces this)
- Vertex AI / Google OAuth (replaced by the existing Keycloak/Auth0 auth flow)
- Gemini-specific content generation API (replaced by agent-api-server SSE)

---

## 6. Technical Stack

| Layer | Technology | Rationale |
|---|---|---|
| Runtime | Node.js 20+ | Matches agent-api-server; async/streams native |
| Language | TypeScript 5.x | Type safety; consistent with rest of ecosystem |
| Terminal UI | [Ink](https://github.com/vadimdemedes/ink) v4+ | React for terminal; used by Gemini CLI, Vercel CLI |
| Markdown rendering | [ink-markdown](https://github.com/cameronhunter/ink-markdown) or custom | Render LLM responses with formatting |
| SSE client | `eventsource` npm package | Browser-compatible SSE in Node.js |
| HTTP client | `node-fetch` or built-in `fetch` (Node 18+) | REST calls to agent-api-server |
| Config storage | `~/.config/agent-cli/config.json` | Platform-standard location |
| Token storage | macOS: Keychain via `keytar`; fallback: config file | Secure credential storage |
| CLI arg parsing | `commander` or `yargs` | Mature, well-documented |
| Markdown-in-terminal | `marked-terminal` | Convert markdown to ANSI |

---

## 7. Configuration

Config file location: `~/.config/agent-cli/config.json`

```json
{
  "server": {
    "url": "https://agent.pik8s.internal",
    "allowSelfSignedCerts": true
  },
  "auth": {
    "token": "<JWT>",
    "provider": "keychain"
  },
  "defaults": {
    "assignmentId": null,
    "createNewAssignmentOnStart": true,
    "assignmentTitlePrefix": "CLI Session"
  },
  "ui": {
    "streamingEnabled": true,
    "showPlanSteps": true,
    "showToolInputs": true,
    "markdownRendering": true,
    "theme": "dark"
  }
}
```

Config is created on first run via `agent-cli auth` interactive setup.

### Environment variable overrides

| Env Var | Config Key | Description |
|---|---|---|
| `AGENT_SERVER_URL` | `server.url` | Override server URL |
| `AGENT_TOKEN` | `auth.token` | JWT token (skips Keychain) |
| `AGENT_ASSIGNMENT_ID` | `defaults.assignmentId` | Resume specific assignment |

---

## 8. Slash Commands

| Command | Description |
|---|---|
| `/help` | Show all commands |
| `/clear` | Clear terminal |
| `/history` | Show last N messages in current assignment |
| `/assignment new [title]` | Start a new assignment |
| `/assignment list` | List assignments |
| `/assignment use <id>` | Switch to existing assignment |
| `/assignment archive` | Archive current assignment |
| `/tools` | List available tools from server |
| `/status` | Show server health (calls `GET /health/detailed`) |
| `/cancel` | Cancel the currently running agent run |
| `/exit` | Quit the CLI |

---

## 9. Installation

### npm global (recommended)
```bash
npm install -g @bouc.io/agent-cli
agent-cli
```

### npx (no install)
```bash
npx @bouc.io/agent-cli
```

### First-run setup
```bash
agent-cli auth
# Prompts for:
#   Server URL (default: https://agent.pik8s.internal)
#   JWT token (stored in macOS Keychain)
#   Allow self-signed certs? [y/N]
```

### Non-interactive mode
```bash
agent-cli --prompt "What is the weather in Montreal?" --no-interactive
agent-cli --prompt "Calculate 15% of 847" --assignment-id <uuid>
```

---

## 10. Project Structure

```
agent-cli/
├── DESIGN.md                 # This file
├── README.md
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.tsx             # Entry point — CLI arg parsing, render App
│   ├── app.tsx               # Root Ink component — routes interactive vs headless
│   ├── config/
│   │   ├── config.ts         # Load/save ~/.config/agent-cli/config.json
│   │   └── auth.ts           # Token retrieval (Keychain or env var)
│   ├── api/
│   │   ├── client.ts         # HTTP client wrapper (fetch + auth headers)
│   │   ├── assignments.ts    # Assignment CRUD
│   │   ├── messages.ts       # Message creation + listing
│   │   ├── runs.ts           # Run creation, cancellation, status
│   │   └── stream.ts         # SSE EventSource client + event parsing
│   ├── ui/
│   │   ├── components/
│   │   │   ├── Prompt.tsx        # Input component
│   │   │   ├── MessageList.tsx   # Conversation history
│   │   │   ├── StreamView.tsx    # Live SSE event rendering
│   │   │   ├── PlanBlock.tsx     # Collapsible plan steps
│   │   │   ├── ToolCallRow.tsx   # Tool call + result row
│   │   │   ├── AssistantMessage.tsx # Markdown-rendered response
│   │   │   └── StatusBar.tsx     # Assignment info, connection status
│   │   └── hooks/
│   │       ├── useStream.ts      # SSE subscription hook
│   │       └── useAssignment.ts  # Assignment state management
│   ├── commands/
│   │   └── slash.ts          # Slash command handlers
│   └── utils/
│       ├── markdown.ts       # ANSI markdown rendering
│       └── logger.ts         # Structured JSON logging (stderr)
└── dist/                     # Compiled output
```

---

## 11. MVP Scope

### Phase 1 (MVP)
- [x] Ink-based interactive REPL
- [x] Auth via config file / Keychain
- [x] Create / resume assignments
- [x] Send messages, receive SSE stream
- [x] Render plan steps, tool calls, tool results
- [x] Render final assistant message (markdown)
- [x] `/help`, `/clear`, `/assignment`, `/cancel`, `/status`, `/tools` slash commands
- [x] Non-interactive `--prompt` mode
- [x] `agent-cli auth` setup wizard
- [x] npm global install + npx

### Phase 2 (Local Tools)
- [ ] Client-intercept protocol for client-side tool execution
- [ ] `bash` tool — local shell command execution
- [ ] `read_file`, `write_file` — local file I/O
- [ ] `glob_files`, `list_dir` — local filesystem navigation
- [ ] Tool approval mode (prompt before executing bash commands)
- [ ] `AGENT.md` context file injection (project-level system prompt)

### Phase 3 (Polish)
- [ ] Homebrew tap for macOS install
- [ ] Session history persistence (resume across CLI restarts)
- [ ] `agent-cli mcp` — MCP server integration (if agent-api-server adds MCP support)
- [ ] Vim keybindings in prompt
- [ ] Mouse support

---

## 12. Logging

Follows the workspace logging standard (see root `CLAUDE.md`):

- Structured JSON logs written to **stderr** (never stdout — stdout is used by Ink/terminal UI)
- Required fields: `timestamp`, `level`, `agent`, `message`, `request_id`, `component`, `elapsed_ms`
- Log level controlled by `LOG_LEVEL` env var (default: `info`)
- Canonical operation summary log includes `duration_ms`, `status`, `metrics`
