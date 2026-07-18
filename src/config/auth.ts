import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { URL, URLSearchParams } from 'node:url';
import open from 'open';
import type { Config } from './config.js';

const TOKEN_DIR = path.join(os.homedir(), '.config', 'agent-cli');
const TOKEN_FILE = path.join(TOKEN_DIR, 'tokens.json');

interface StoredTokens {
    access_token: string;
    refresh_token: string;
}

function readTokenFile(): StoredTokens | null {
    try {
        return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')) as StoredTokens;
    } catch {
        return null;
    }
}

export class AuthExpiredError extends Error {
    constructor() {
        super('Session expired — type /login to re-authenticate');
        this.name = 'AuthExpiredError';
    }
}

// ── Token storage ────────────────────────────────────────────────────────────

export async function getStoredToken(): Promise<string | null> {
    // Static env override (stub / dev mode)
    if (process.env.AGENT_TOKEN) return process.env.AGENT_TOKEN;
    return readTokenFile()?.access_token ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
    return readTokenFile()?.refresh_token ?? null;
}

export async function setStoredToken(accessToken: string, refreshToken: string): Promise<void> {
    fs.mkdirSync(TOKEN_DIR, { recursive: true });
    fs.writeFileSync(
        TOKEN_FILE,
        JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }, null, 2),
        { encoding: 'utf8', mode: 0o600 }
    );
}

export async function clearTokens(): Promise<void> {
    try { fs.unlinkSync(TOKEN_FILE); } catch { /* already gone */ }
}

// ── JWT helpers ──────────────────────────────────────────────────────────────

export function decodeJwtPayload(token: string): Record<string, unknown> {
    try {
        const parts = token.split('.');
        if (parts.length < 2) return {};
        const payload = parts[1];
        const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
        return JSON.parse(Buffer.from(padded, 'base64url').toString('utf8')) as Record<string, unknown>;
    } catch {
        return {};
    }
}

export function getUsernameFromToken(token: string): string {
    const payload = decodeJwtPayload(token);
    return (payload.preferred_username as string) || (payload.sub as string) || 'unknown';
}

// ── PKCE helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
    return crypto.randomBytes(64).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ── OAuth PKCE login flow ────────────────────────────────────────────────────

export interface LoginResult {
    accessToken: string;
    refreshToken: string;
    username: string;
}

/**
 * Full Authorization Code + PKCE browser login flow:
 * 1. Start local callback server
 * 2. Open browser to Keycloak authorization URL
 * 3. Wait for redirect with auth code
 * 4. Exchange code for tokens
 * 5. Store in ~/.config/agent-cli/tokens.json (mode 0600)
 */
export async function performLogin(config: Config): Promise<LoginResult> {
    if (!config.auth.loginUrl || !config.auth.tokenUrl) {
        throw new Error(
            'AGENT_LOGIN_URL and AGENT_TOKEN_URL must be set. ' +
            'Add them to ~/.config/agent-cli/config.json or your environment.'
        );
    }

    const port = config.auth.callbackPort;
    const redirectUri = `http://localhost:${port}/callback`;
    const state = crypto.randomUUID();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Build authorization URL
    const authUrl = new URL(config.auth.loginUrl);
    authUrl.searchParams.set('client_id', config.auth.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', 'openid profile');

    return new Promise<LoginResult>((resolve, reject) => {
        let settled = false;

        const server = http.createServer(async (req, res) => {
            if (!req.url?.startsWith('/callback')) {
                res.writeHead(404).end();
                return;
            }

            const callbackUrl = new URL(req.url, `http://localhost:${port}`);
            const code = callbackUrl.searchParams.get('code');
            const returnedState = callbackUrl.searchParams.get('state');
            const error = callbackUrl.searchParams.get('error');

            if (error) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(`<html><body><h2>Login failed: ${error}</h2><p>You may close this tab.</p></body></html>`);
                server.close();
                if (!settled) { settled = true; reject(new Error(`OAuth error: ${error}`)); }
                return;
            }

            if (!code || returnedState !== state) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end('<html><body><h2>Invalid callback</h2><p>You may close this tab.</p></body></html>');
                server.close();
                if (!settled) { settled = true; reject(new Error('Invalid state in OAuth callback')); }
                return;
            }

            // Exchange code for tokens
            try {
                const tokenRes = await fetch(config.auth.tokenUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        grant_type: 'authorization_code',
                        client_id: config.auth.clientId,
                        code,
                        redirect_uri: redirectUri,
                        code_verifier: codeVerifier,
                    }).toString(),
                });

                if (!tokenRes.ok) {
                    const body = await tokenRes.text();
                    throw new Error(
                        `Token exchange failed (HTTP ${tokenRes.status}): ${body}\n` +
                        `Hint: if the token URL uses a self-signed cert, set AGENT_ALLOW_SELF_SIGNED=true`
                    );
                }

                const tokens = await tokenRes.json() as {
                    access_token: string;
                    refresh_token: string;
                };

                await setStoredToken(tokens.access_token, tokens.refresh_token);
                const username = getUsernameFromToken(tokens.access_token);

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(
                    `<html><body>` +
                    `<h2>Login successful!</h2>` +
                    `<p>Logged in as <strong>${username}</strong>. You may close this tab.</p>` +
                    `</body></html>`
                );
                server.close();

                if (!settled) {
                    settled = true;
                    resolve({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, username });
                }
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<html><body><h2>Token exchange failed</h2><p>You may close this tab.</p></body></html>');
                server.close();
                if (!settled) { settled = true; reject(err); }
            }
        });

        server.on('error', (err) => {
            if (!settled) { settled = true; reject(err); }
        });

        server.listen(port, '127.0.0.1', () => {
            // Open browser to Keycloak login
            open(authUrl.toString()).catch(() => {
                // If open() fails, show the URL so the user can open it manually
                console.error(`\nOpen this URL in your browser:\n${authUrl.toString()}\n`);
            });
        });

        // 5-minute timeout
        setTimeout(() => {
            server.close();
            if (!settled) { settled = true; reject(new Error('Login timed out after 5 minutes')); }
        }, 5 * 60 * 1000);
    });
}

// ── Token refresh ────────────────────────────────────────────────────────────

/**
 * Attempt a silent refresh using the stored refresh token.
 * Returns the new access token, or null if refresh failed.
 */
export async function refreshAccessToken(config: Config): Promise<string | null> {
    const refreshToken = await getRefreshToken();
    if (!refreshToken || !config.auth.tokenUrl) return null;

    try {
        const res = await fetch(config.auth.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: config.auth.clientId,
                refresh_token: refreshToken,
            }).toString(),
        });

        if (!res.ok) return null;

        const tokens = await res.json() as { access_token: string; refresh_token: string };
        await setStoredToken(tokens.access_token, tokens.refresh_token);
        return tokens.access_token;
    } catch {
        return null;
    }
}
