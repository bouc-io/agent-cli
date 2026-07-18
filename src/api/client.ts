import https from 'node:https';
import type { Config } from '../config/config.js';
import { getStoredToken, refreshAccessToken, AuthExpiredError } from '../config/auth.js';
import { withRetry } from './withRetry.js';

export class ApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

// HTTP status codes that warrant a retry with backoff
const RETRYABLE_STATUS = new Set([429, 503, 529]);

let _config: Config | null = null;
let _selfSignedAgent: https.Agent | null = null;

export function initClient(config: Config): void {
    _config = config;
    if (config.server.allowSelfSignedCerts) {
        _selfSignedAgent = new https.Agent({ rejectUnauthorized: false });
    }
}

function getConfig(): Config {
    if (!_config) throw new Error('API client not initialised — call initClient() first');
    return _config;
}

async function buildHeaders(): Promise<Record<string, string>> {
    const token = await getStoredToken();
    if (!token) throw new AuthExpiredError();
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-auth-request-access-token': token,
    };
}

async function doFetch(url: string, init: RequestInit, retried = false, rateAttempt = 0): Promise<Response> {
    const config = getConfig();
    const fetchOptions: RequestInit & { agent?: https.Agent } = { ...init };

    if (config.server.allowSelfSignedCerts && _selfSignedAgent) {
        (fetchOptions as Record<string, unknown>)['agent'] = _selfSignedAgent;
    }

    const res = await fetch(url, fetchOptions);

    // HTML response means OAuth2-Proxy redirected to login — surface a clear error
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) {
        throw new ApiError(
            res.status,
            'UNEXPECTED_HTML',
            'Server returned HTML instead of JSON.\n' +
            `API URL: ${config.api.url}\n` +
            'This usually means the JWT is expired/invalid or the Bearer token was rejected.\n' +
            'Run /login to re-authenticate, or check AGENT_API_URL in your .env.'
        );
    }

    // Retry on rate-limit / server overload with exponential backoff
    if (RETRYABLE_STATUS.has(res.status) && rateAttempt < 4) {
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '0', 10);
        const delay = retryAfter > 0
            ? Math.min(retryAfter * 1000, 30000)
            : 500 * Math.pow(2, rateAttempt) + Math.random() * 100;
        await new Promise<void>((r) => setTimeout(r, delay));
        return doFetch(url, init, retried, rateAttempt + 1);
    }

    // Attempt silent token refresh on first 401
    if (res.status === 401 && !retried) {
        const newToken = await refreshAccessToken(config);
        if (!newToken) throw new AuthExpiredError();
        const retryHeaders = {
            ...(init.headers as Record<string, string>),
            Authorization: `Bearer ${newToken}`,
            'x-auth-request-access-token': newToken,
        };
        return doFetch(url, { ...init, headers: retryHeaders }, true);
    }

    return res;
}

async function parseError(res: Response): Promise<ApiError> {
    let rawBody = '';
    try {
        rawBody = await res.text();
        const body = JSON.parse(rawBody) as { error?: { code?: string; message?: string } | string };
        const errObj = typeof body.error === 'object' && body.error !== null ? body.error : null;
        const code = errObj?.code ?? 'UNKNOWN';
        const message = errObj?.message ?? `HTTP ${res.status} ${res.statusText}`;
        return new ApiError(res.status, code, message);
    } catch {
        const snippet = rawBody.slice(0, 200);
        return new ApiError(res.status, 'UNKNOWN', `HTTP ${res.status} ${res.statusText}${snippet ? `: ${snippet}` : ''}`);
    }
}

export async function apiGet<T>(path: string): Promise<T> {
    return withRetry(async () => {
        const config = getConfig();
        const headers = await buildHeaders();
        const res = await doFetch(`${config.api.url}${path}`, { method: 'GET', headers });
        if (!res.ok) throw await parseError(res);
        return res.json() as Promise<T>;
    });
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
    const config = getConfig();
    const headers = await buildHeaders();
    const res = await doFetch(`${config.api.url}${path}`, {
        method: 'POST',
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw await parseError(res);
    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
    const config = getConfig();
    const headers = await buildHeaders();
    const res = await doFetch(`${config.api.url}${path}`, {
        method: 'PATCH',
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw await parseError(res);
    return res.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
    const config = getConfig();
    const headers = await buildHeaders();
    const res = await doFetch(`${config.api.url}${path}`, { method: 'DELETE', headers });
    if (!res.ok) throw await parseError(res);
}

/** Idempotent — safe to retry on transient network errors. */
export async function postToolResult(
    assignmentId: string,
    runId: string,
    toolCallId: string,
    result: { success: boolean; output: unknown; error?: string }
): Promise<void> {
    await withRetry(() =>
        apiPost(`/v1/assignments/${assignmentId}/runs/${runId}/tool-results`, {
            tool_call_id: toolCallId,
            output: result.output,
            ...(result.error !== undefined && { error: result.error }),
        })
    );
}

export function getServerUrl(): string {
    return getConfig().api.url;
}

export function getAllowSelfSigned(): boolean {
    return getConfig().server.allowSelfSignedCerts;
}
