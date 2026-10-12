# agent-cli

A terminal-based interactive client for the bouc.io AI assistant platform. Converse with the AI agent, observe real-time tool execution, and start fresh sessions — all from the command line.

Inspired by [Gemini CLI](https://github.com/google-gemini/gemini-cli), `agent-cli` is a thin client over `agent-api-server`, inheriting its full two-phase Planner→Executor loop, memory integration, and server-side tools without duplicating any backend logic.

---

## Features

- **Interactive REPL** — persistent terminal prompt with conversation history
- **Real-time streaming** — plan steps, tool calls, and responses rendered progressively via SSE
- **Markdown rendering** — assistant responses formatted with ANSI colours and styles
- **Auto-session management** — a fresh session is created automatically on startup; type `/new` to start over
- **Server-side tools** — web search, calculator, HTTP requests, date/time operations available immediately
- **Non-interactive mode** — pipe prompts in scripts with `--prompt`
- **Slash commands** — `/tools`, `/status`, `/cancel`, `/new`, and more
- **Secure auth** — OAuth2 PKCE browser login; tokens stored in macOS Keychain via `keytar`

---

## Architecture

`agent-cli` is a **thin client** to `agent-api-server`. All LLM reasoning, tool orchestration, and memory management run on the server.

```
agent-cli  (local terminal)
     │
     │  REST + SSE  (HTTPS)
     ▼
agent-api-server
     ├── Ollama  (Planner + Executor LLM loop)
     ├── memory-api-server  (pgvector retrieval)
     └── memory-distiller   (post-run memory classification)
```

**Per-message flow:**

```
User input
    │
    ▼  POST /v1/assignments/:id/messages
agent-api-server  →  202 + { run.id, stream_url }
    │
    ▼  GET /v1/assignments/:id/runs/:runId/stream  (SSE)
plan.created  →  tool.call  →  tool.result  →  run.completed
    │                │               │               │
    ▼                ▼               ▼               ▼
Plan block      Spinner         Result row      Final answer
```

**Sessions:** Each time the CLI starts (or you type `/new`), a fresh assignment is created automatically on the server. You never need to manage assignments manually — the CLI handles this transparently.

For the full design rationale (agent-api-server vs Ollama, Phase 2 local tools, client-intercept protocol), see [DESIGN.md](./DESIGN.md).

---

## Tech Stack

- [Node.js](https://nodejs.org/) 22.12+ / [TypeScript](https://www.typescriptlang.org/) 5.x
- [Ink](https://github.com/vadimdemedes/ink) — React for terminal interfaces
- [eventsource](https://www.npmjs.com/package/eventsource) — SSE client
- [keytar](https://github.com/atom/node-keytar) — macOS Keychain integration
- [commander](https://github.com/tj/commander.js) — CLI argument parsing
- [marked-terminal](https://github.com/mikaelbr/marked-terminal) — Markdown → ANSI

---

## Prerequisites

- Node.js 22.12 or later
- A running `agent-api-server` instance (local or remote)
- A Keycloak (or compatible) OAuth2 server for authentication

---

## Installation

### From source

Clone the `agent-cli` repository, then:

```bash
cd agent-cli
npm install
npm run build
npm link          # makes `agent-cli` available globally
```

---

## Setup

Create a `.env` file in the project directory (or export these variables in your shell):

```bash
# Required: agent-api-server URL
AGENT_SERVER_URL=https://agent.pik8s.internal

# Required for /login (OAuth2 PKCE via Keycloak)
AGENT_LOGIN_URL=https://sso.pik8s.internal/realms/users/protocol/openid-connect/auth
AGENT_TOKEN_URL=https://sso.pik8s.internal/realms/users/protocol/openid-connect/token
AGENT_OAUTH_CLIENT_ID=agent-cli
AGENT_CALLBACK_PORT=8899

# Optional: allow self-signed TLS certs (local/dev clusters)
AGENT_ALLOW_SELF_SIGNED=true

# Dev/stub: skip OAuth entirely, use a static JWT
# AGENT_TOKEN=eyJ...
```

Then authenticate:

```bash
agent-cli         # launches REPL
/login            # opens Keycloak login in your browser
```

After a successful login, your tokens are stored in the macOS Keychain and reused on subsequent runs. Re-run `/login` to refresh expired credentials.

---

## Usage

### Interactive mode

```bash
agent-cli
```

```
  Logged in as: martin

> Search for the latest Node.js LTS release

  Plan
  ─────────────────────────────────────────
  1. Search the web for Node.js LTS release
  2. Summarise the results

  ⚙ web_search { "query": "Node.js latest LTS release 2026" }
  ✓ web_search → 5 results

  Node.js 22 (Jod) is the current LTS release, active until April 2027...

>
```

### Non-interactive mode

```bash
# Single prompt, output to stdout
agent-cli --prompt "What is 15% of 847?"

# Pipe output to a file
agent-cli --prompt "List GCP regions" --no-interactive > regions.txt
```

---

## Slash Commands

| Command | Description |
|---|---|
| `/login` | Authenticate via browser (OAuth2 PKCE) |
| `/logout` | Remove stored credentials from Keychain |
| `/help` | Show all available commands |
| `/clear` | Clear the terminal |
| `/history [n]` | Show last _n_ messages in the current session (default: 20) |
| `/new` | Discard the current session and start a fresh one |
| `/tools` | List tools available on the server |
| `/status` | Show server health (calls `GET /health/detailed`) |
| `/cancel` | Cancel the currently running agent run |
| `/exit` | Quit the CLI |

---

## Environment Variables

Environment variables override values in `~/.config/agent-cli/config.json`.

| Variable | Description | Example |
|---|---|---|
| `AGENT_SERVER_URL` | Agent API server URL | `https://agent.pik8s.internal` |
| `AGENT_ALLOW_SELF_SIGNED` | Allow self-signed TLS certs | `true` |
| `AGENT_LOGIN_URL` | Keycloak authorization endpoint | `https://sso.../auth` |
| `AGENT_TOKEN_URL` | Keycloak token endpoint | `https://sso.../token` |
| `AGENT_OAUTH_CLIENT_ID` | OAuth2 public client ID | `agent-cli` |
| `AGENT_CALLBACK_PORT` | Local OAuth callback server port | `8899` |
| `AGENT_TOKEN` | Static JWT — skips OAuth entirely (dev/stub) | `eyJ...` |

---

## Configuration File

`~/.config/agent-cli/config.json`

```json
{
  "server": {
    "url": "https://agent.pik8s.internal",
    "allowSelfSignedCerts": true
  },
  "auth": {
    "loginUrl": "https://sso.pik8s.internal/realms/users/protocol/openid-connect/auth",
    "tokenUrl": "https://sso.pik8s.internal/realms/users/protocol/openid-connect/token",
    "clientId": "agent-cli",
    "callbackPort": 8899
  },
  "ui": {
    "streamingEnabled": true,
    "showPlanSteps": true,
    "markdownRendering": true
  }
}
```

All fields are optional — the CLI falls back to built-in defaults and then applies any environment variable overrides.

---

## Project Structure

```
agent-cli/
├── src/
│   ├── index.tsx              # Entry point — arg parsing, render App
│   ├── headless.ts            # Non-interactive mode implementation
│   ├── config/
│   │   ├── config.ts          # Load ~/.config/agent-cli/config.json
│   │   └── auth.ts            # OAuth PKCE login + Keychain token storage
│   ├── api/
│   │   ├── client.ts          # HTTP client wrapper (fetch + auth headers)
│   │   ├── assignments.ts     # Assignment creation (internal, invisible to user)
│   │   ├── messages.ts        # Message creation + listing
│   │   ├── runs.ts            # Run cancellation
│   │   └── stream.ts          # SSE EventSource client + event parsing
│   ├── ui/
│   │   ├── components/
│   │   │   ├── App.tsx            # Root Ink component
│   │   │   ├── Prompt.tsx         # Input component with history cycling
│   │   │   ├── MessageList.tsx    # Conversation history (/history)
│   │   │   ├── StreamView.tsx     # Live SSE event rendering
│   │   │   ├── PlanBlock.tsx      # Collapsible plan steps
│   │   │   ├── ToolCallRow.tsx    # Tool call + result row
│   │   │   ├── AssistantMessage.tsx  # Markdown-rendered response
│   │   │   └── StatusBar.tsx      # Server URL + logged-in username
│   │   └── hooks/
│   │       ├── useStream.ts       # SSE subscription hook
│   │       └── useAssignment.ts   # Auto-session lifecycle hook
│   ├── commands/
│   │   └── slash.ts           # Slash command handlers
│   └── utils/
│       ├── markdown.ts        # ANSI markdown rendering
│       └── logger.ts          # Structured JSON logging (stderr)
├── dist/                      # Compiled output
├── DESIGN.md                  # Architecture and design decisions
├── package.json
└── tsconfig.json
```

---

## Development

```bash
# Install dependencies
npm install

# Development mode (live TypeScript execution)
npm run dev

# Production build
npm run build

# Run compiled build
npm start

# Format
npm run format
```

---

## Deployment

`agent-cli` is distributed as an npm package. It runs entirely on the developer's local machine — no Docker or Kubernetes deployment required.

To publish a new version:

```bash
npm run build
npm version patch   # or minor / major
npm publish --access public
```

CI is handled by the GitLab pipeline (`.gitlab-ci.yml`), which runs lint and publishes on tagged commits.

---

## Roadmap

- **Phase 2 — Local tools:** `bash`, `read_file`, `write_file`, `glob_files`, `list_dir` executing on the CLI machine via client-intercept protocol (see [DESIGN.md § 4.2](./DESIGN.md))
- **Phase 3 — Homebrew tap** for macOS install without Node.js prerequisite
- **Phase 3 — Vim keybindings** in the prompt

---

## Quality Gates

```bash
npm run lint          # ESLint (flat config)
npm run lint:fix      # auto-fix what is mechanically fixable
npm run format:check  # prettier, check only
npm run format        # prettier, write
npm run build         # tsc
npm test              # vitest, unit tests only
npm run test:ci       # vitest + coverage, writes junit.xml and coverage/
```

CI runs `lint` and `unit-test` from the shared `bouc-io/ci-templates` project.

- **Lint uses a warning ratchet.** ESLint *errors* always fail the build. Warnings are
  capped by `max_warnings` in `.gitlab-ci.yml`, currently **3** (3 no-unused-vars). When you
  clean some up, lower the number. Never raise it, and never silence a rule repo-wide to
  get green.
- **Formatting is enforced.** `format:check` gates, using prettier defaults with no config
  file.
- **`no-console` is deliberately off.** This is a terminal app, so stdout is the product
  rather than a logging shortcut.

Two things to know before you ever run a bulk reformat here:

- **Prettier needs two passes.** It breaks some method chains across lines on the first
  pass and collapses them back on the second, so a single
  `npm run format` can leave `format:check` failing.
- **Prettier can wrap a statement out from under an `eslint-disable-next-line`.** That is
  why the suppressions in this repo use block `/* eslint-disable rule */ ... /* eslint-enable rule */`
  pairs, which survive re-wrapping. Keep them that way.

## Related Services

| Service | Description |
|---|---|
| [agent-api-server](../agent-api-server) | Backend agent server (required) |
| [monochrome-agent-ui](../monochrome-agent-ui) | Web UI equivalent of this CLI |
| [memory-api-server](../memory-api-server) | Memory retrieval service |
| [memory-distiller](../memory-distiller) | Post-run memory classification |

## License

[Elastic License 2.0](./LICENSE) — source-available; not OSI open source.
