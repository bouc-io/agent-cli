import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface Config {
    server: {
        url: string;
        allowSelfSignedCerts: boolean;
    };
    api: {
        /** Base URL for all API calls (assignments, tools, health, SSE stream). */
        url: string;
    };
    auth: {
        loginUrl: string;
        tokenUrl: string;
        clientId: string;
        callbackPort: number;
        /** Static token override — skips OAuth entirely (dev/stub mode) */
        staticToken: string | null;
    };
    defaults: {
        assignmentId: string | null;
        createNewAssignmentOnStart: boolean;
        assignmentTitlePrefix: string;
    };
    ui: {
        streamingEnabled: boolean;
        showPlanSteps: boolean;
        markdownRendering: boolean;
    };
}

const CONFIG_DIR = path.join(os.homedir(), '.config', 'agent-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const defaults: Config = {
    server: {
        url: 'https://agent.pik8s.internal',
        allowSelfSignedCerts: false,
    },
    api: {
        // Defaults to same as server for backward compat with non-cluster setups.
        // Override with AGENT_API_URL to send API calls to a dedicated endpoint
        // (e.g. https://api.pik8s.internal) while keeping OAuth login on agent.*.
        url: 'https://agent.pik8s.internal',
    },
    auth: {
        loginUrl: '',
        tokenUrl: '',
        clientId: 'agent-cli',
        callbackPort: 8899,
        staticToken: null,
    },
    defaults: {
        assignmentId: null,
        createNewAssignmentOnStart: true,
        assignmentTitlePrefix: 'CLI Session',
    },
    ui: {
        streamingEnabled: true,
        showPlanSteps: true,
        markdownRendering: true,
    },
};

/**
 * Load config from file, then apply environment variable overrides.
 * Environment variables always win over the config file.
 */
export function loadConfig(): Config {
    let fileConfig: Partial<Config> = {};

    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
            fileConfig = JSON.parse(raw) as Partial<Config>;
        }
    } catch {
        // Ignore parse errors — fall back to defaults
    }

    const merged: Config = {
        server: { ...defaults.server, ...(fileConfig.server ?? {}) },
        api: { ...defaults.api, ...(fileConfig.api ?? {}) },
        auth: { ...defaults.auth, ...(fileConfig.auth ?? {}) },
        defaults: { ...defaults.defaults, ...(fileConfig.defaults ?? {}) },
        ui: { ...defaults.ui, ...(fileConfig.ui ?? {}) },
    };

    // Environment variable overrides
    if (process.env.AGENT_SERVER_URL) merged.server.url = process.env.AGENT_SERVER_URL;
    // AGENT_API_URL separates API calls from the OAuth login host.
    // If not set, defaults to AGENT_SERVER_URL (or the config file / hardcoded default).
    if (process.env.AGENT_API_URL) merged.api.url = process.env.AGENT_API_URL;
    else if (process.env.AGENT_SERVER_URL && !process.env.AGENT_API_URL) {
        // When only AGENT_SERVER_URL is set (no AGENT_API_URL), keep api.url in sync
        // so single-env setups (e.g. port-forward) continue to work unchanged.
        merged.api.url = merged.server.url;
    }
    if (process.env.AGENT_ALLOW_SELF_SIGNED) {
        merged.server.allowSelfSignedCerts = process.env.AGENT_ALLOW_SELF_SIGNED === 'true';
    }
    if (process.env.AGENT_LOGIN_URL) merged.auth.loginUrl = process.env.AGENT_LOGIN_URL;
    if (process.env.AGENT_TOKEN_URL) merged.auth.tokenUrl = process.env.AGENT_TOKEN_URL;
    if (process.env.AGENT_OAUTH_CLIENT_ID) merged.auth.clientId = process.env.AGENT_OAUTH_CLIENT_ID;
    if (process.env.AGENT_CALLBACK_PORT) {
        merged.auth.callbackPort = parseInt(process.env.AGENT_CALLBACK_PORT, 10);
    }
    if (process.env.AGENT_TOKEN) merged.auth.staticToken = process.env.AGENT_TOKEN;
    if (process.env.AGENT_ASSIGNMENT_ID) merged.defaults.assignmentId = process.env.AGENT_ASSIGNMENT_ID;

    return merged;
}

export function saveConfig(config: Config): void {
    try {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    } catch (err) {
        throw new Error(`Failed to save config: ${err instanceof Error ? err.message : String(err)}`);
    }
}

export function savePartialConfig(partial: Partial<Config>): void {
    const current = loadConfig();
    const updated: Config = {
        server: { ...current.server, ...(partial.server ?? {}) },
        api: { ...current.api, ...(partial.api ?? {}) },
        auth: { ...current.auth, ...(partial.auth ?? {}) },
        defaults: { ...current.defaults, ...(partial.defaults ?? {}) },
        ui: { ...current.ui, ...(partial.ui ?? {}) },
    };
    saveConfig(updated);
}
