import { EventSource } from 'eventsource';
import { getStoredToken } from '../config/auth.js';
import { getServerUrl } from './client.js';

export interface PlanStep {
    id: number;
    description: string;
    tool_intent?: string;
}

export interface StreamHandlers {
    onPlanCreated?: (data: { goal: string; steps: PlanStep[] }) => void;
    onStepReasoning?: (data: { step_index: number; summary: string; content?: string | null }) => void;
    onToolCall?: (data: { tool_name: string; args: Record<string, unknown> }) => void;
    onToolResult?: (data: { tool_name: string; success: boolean; output_summary: string }) => void;
    /** Phase 3: local tool execution. Noop in Phase 2. */
    onClientToolCall?: (data: {
        tool_call_id: string;
        tool_name: string;
        args: Record<string, unknown>;
    }) => void;
    onMessageCreated?: (data: { role: string; content: string }) => void;
    onRunCompleted?: (data: { run_id: string; tokens_used?: number; cost_usd?: number }) => void;
    onRunFailed?: (data: { run_id: string; error: string }) => void;
    onRunCancelled?: (data: { run_id: string }) => void;
    onRunStatus?: (data: { status: string }) => void;
    onError?: (err: Error) => void;
    onDone?: () => void;
}

const TERMINAL_EVENTS = new Set(['run.completed', 'run.failed', 'run.cancelled']);

/**
 * Subscribe to a run's SSE stream. Returns the EventSource so the caller
 * can close it early (e.g. on component unmount or /cancel).
 */
export async function subscribeToStream(
    streamPath: string,
    handlers: StreamHandlers
): Promise<EventSource> {
    const token = await getStoredToken();
    const serverUrl = getServerUrl();
    const url = `${serverUrl}${streamPath}`;

    // eventsource v3 uses a custom `fetch` option to inject headers
    const authHeaders: Record<string, string> = {
        Authorization: `Bearer ${token ?? ''}`,
        'x-auth-request-access-token': token ?? '',
    };

    const es = new EventSource(url, {
        fetch: (input, init) =>
            fetch(input, {
                ...init,
                headers: { ...(init?.headers as Record<string, string> | undefined), ...authHeaders },
            }),
    });

    const dispatch = (eventType: string, raw: string) => {
        let data: Record<string, unknown>;
        try {
            data = JSON.parse(raw) as Record<string, unknown>;
        } catch {
            return;
        }

        switch (eventType) {
            case 'run.status':
                handlers.onRunStatus?.(data as { status: string });
                break;
            case 'plan.created':
                handlers.onPlanCreated?.(data as { goal: string; steps: PlanStep[] });
                break;
            case 'step.reasoning':
                handlers.onStepReasoning?.(
                    data as { step_index: number; summary: string; content?: string | null }
                );
                break;
            case 'tool.call':
                handlers.onToolCall?.(
                    data as { tool_name: string; args: Record<string, unknown> }
                );
                break;
            case 'tool.result':
                handlers.onToolResult?.(
                    data as { tool_name: string; success: boolean; output_summary: string }
                );
                break;
            case 'tool.client_call':
                // Phase 3 will intercept this. In Phase 2, noop.
                handlers.onClientToolCall?.(
                    data as { tool_call_id: string; tool_name: string; args: Record<string, unknown> }
                );
                break;
            case 'message.created':
                handlers.onMessageCreated?.(data as { role: string; content: string });
                break;
            case 'run.completed':
                handlers.onRunCompleted?.(data as { run_id: string });
                break;
            case 'run.failed':
                handlers.onRunFailed?.(data as { run_id: string; error: string });
                break;
            case 'run.cancelled':
                handlers.onRunCancelled?.(data as { run_id: string });
                break;
        }

        if (TERMINAL_EVENTS.has(eventType)) {
            es.close();
            handlers.onDone?.();
        }
    };

    // eventsource fires named events; subscribe to each known type
    const eventTypes = [
        'run.status', 'plan.created', 'step.reasoning',
        'tool.call', 'tool.result', 'tool.client_call',
        'message.created', 'run.completed', 'run.failed', 'run.cancelled',
    ];

    for (const type of eventTypes) {
        es.addEventListener(type, (e: MessageEvent) => dispatch(type, e.data as string));
    }

    // Fallback: unnamed messages carry type in payload
    es.onmessage = (e: MessageEvent) => {
        try {
            const parsed = JSON.parse(e.data as string) as Record<string, unknown>;
            const type = parsed.type as string | undefined;
            if (type) dispatch(type, e.data as string);
        } catch {
            // Ignore non-JSON messages
        }
    };

    es.onerror = (e: Event) => {
        handlers.onError?.(new Error(`SSE error: ${JSON.stringify(e)}`));
    };

    return es;
}
