#!/usr/bin/env node
// Load .env from the current working directory BEFORE anything else reads process.env.
// This must be a static top-level import so it runs before config/auth modules initialise.
import 'dotenv/config';

// Allow self-signed TLS certificates when requested.
// Must be set here — before any https/fetch call — so it covers the OAuth token
// exchange (plain fetch) as well as the API client (https.Agent).
// Same pattern as agent-api-server (ALLOW_SELF_SIGNED_CERTS=true).
if (process.env.AGENT_ALLOW_SELF_SIGNED === 'true') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import React from 'react';
import { render } from 'ink';
import { program } from 'commander';
import { loadConfig } from './config/config.js';
import { App } from './ui/components/App.js';
import { runHeadless } from './headless.js';

// ── CLI argument parsing ─────────────────────────────────────────────────────

program
    .name('agent-cli')
    .description('Terminal UI for the bouc.io agent platform')
    .version('1.0.0')
    .option('-p, --prompt <text>', 'Run a single prompt non-interactively and exit')
    .option('--no-interactive', 'Disable interactive mode (requires --prompt)')
    .parse(process.argv);

const opts = program.opts<{
    prompt?: string;
    interactive: boolean;
}>();

// ── Bootstrap ────────────────────────────────────────────────────────────────

const config = loadConfig();

// Headless mode: --prompt supplied, or --no-interactive
if (opts.prompt || !opts.interactive) {
    if (!opts.prompt) {
        process.stderr.write('--prompt is required when running in non-interactive mode\n');
        process.exit(1);
    }
    void runHeadless(opts.prompt, config);
} else {
    // Interactive Ink REPL — each launch starts a fresh session automatically
    const { waitUntilExit } = render(
        <App />,
        { exitOnCtrlC: true }
    );

    waitUntilExit().then(() => {
        process.exit(0);
    }).catch(() => {
        process.exit(1);
    });
}
