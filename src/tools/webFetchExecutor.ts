import { z } from 'zod';
import type { ClientTool, ToolExecutionResult } from './types.js';

const WebFetchInputSchema = z.object({
    url: z.string().url(),
    max_chars: z.number().int().positive().optional(),
});

function stripHtml(html: string): string {
    let text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
    // Collapse runs of whitespace but preserve paragraph breaks
    text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return text;
}

async function executeWebFetch(input: z.infer<typeof WebFetchInputSchema>): Promise<ToolExecutionResult> {
    const { url, max_chars = 10000 } = input;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; agent-cli/1.0)',
                Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
            },
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            return {
                success: false,
                output: { url, status: response.status },
                error: `HTTP ${response.status} ${response.statusText}`,
            };
        }

        const contentType = response.headers.get('content-type') ?? '';
        const raw = await response.text();
        let content = contentType.includes('text/html') ? stripHtml(raw) : raw;

        const truncated = content.length > max_chars;
        if (truncated) content = content.slice(0, max_chars);

        return {
            success: true,
            output: { url, content, truncated, content_type: contentType, chars: content.length },
        };
    } catch (err) {
        return {
            success: false,
            output: { url },
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

export const WebFetchTool: ClientTool<typeof WebFetchInputSchema> = {
    name: 'web_fetch',
    description: 'Fetch the text content of a URL. HTML is stripped to plain text.',
    inputSchema: WebFetchInputSchema,
    requiresApproval: false,
    isReadOnly: true,
    execute: executeWebFetch,
};
