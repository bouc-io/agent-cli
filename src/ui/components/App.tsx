import React, { useEffect, useState, useCallback } from 'react';
import { Box, Text, useApp } from 'ink';
import { Prompt } from './Prompt.js';
import { StreamView } from './StreamView.js';
import { StatusBar } from './StatusBar.js';
import { MessageList } from './MessageList.js';
import { BashApprovalView } from './BashApprovalView.js';
import { BashRunningView } from './BashRunningView.js';
import { WriteFileApprovalView } from './WriteFileApprovalView.js';
import { FileEditApprovalView } from './FileEditApprovalView.js';
import { FileDeleteApprovalView } from './FileDeleteApprovalView.js';
import { FileMoveApprovalView } from './FileMoveApprovalView.js';
import { AskUserView } from './AskUserView.js';
import type { HistoryMessage } from './MessageList.js';
import { useAssignment } from '../hooks/useAssignment.js';
import { useStream } from '../hooks/useStream.js';
import { createMessage } from '../../api/messages.js';
import { initClient, postToolResult } from '../../api/client.js';
import { loadConfig } from '../../config/config.js';
import { getStoredToken, getUsernameFromToken, AuthExpiredError } from '../../config/auth.js';
import { handleSlashCommand } from '../../commands/slash.js';
import { getClientTool } from '../../tools/registry.js';
import type { ToolExecuteOptions } from '../../tools/types.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('app');

// LLMs vary in which field name they use for write_file args — resolve aliases
// before passing to Zod validation.
function resolveWriteFileAliases(args: Record<string, unknown>): Record<string, unknown> {
    return {
        ...args,
        path: args.path ?? args.file_path ?? args.filepath ?? args.filename ?? args.target_path,
        content: args.content ?? args.file_content ?? args.text ?? args.code ?? args.body,
    };
}

interface BashRunning {
    command: string;
    lines: string[];
}

export function App() {
    const { exit } = useApp();
    const config = loadConfig();

    const { assignment, isLoading: sessionLoading, error: sessionError, newSession } = useAssignment();
    const {
        streamEvents, turns, isStreaming, activeRunId, streamError, lastRunStats,
        startStream, stopStream, clearEvents,
        pendingClientTool, clearPendingClientTool,
    } = useStream();

    const [username, setUsername] = useState<string | undefined>();
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [historyMessages, setHistoryMessages] = useState<HistoryMessage[] | null>(null);
    const [initError, setInitError] = useState<string | null>(null);
    const [bashRunning, setBashRunning] = useState<BashRunning | null>(null);

    // ── Initialise ────────────────────────────────────────────────────────────

    useEffect(() => {
        void (async () => {
            try {
                initClient(config);
                const token = await getStoredToken();
                if (!token) {
                    setInitError('Not logged in — type /login to authenticate');
                    return;
                }
                setUsername(getUsernameFromToken(token));
                await newSession();
            } catch (err) {
                if (err instanceof AuthExpiredError) {
                    setInitError('Session expired — type /login to re-authenticate');
                } else {
                    setInitError(err instanceof Error ? err.message : String(err));
                }
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Auto-execute read-only client tools (no approval needed) ──────────────

    useEffect(() => {
        if (!pendingClientTool) return;
        const { assignmentId, toolName, runId, toolCallId, args } = pendingClientTool;
        const tool = getClientTool(toolName);
        if (!tool?.isReadOnly) return;
        clearPendingClientTool();

        void (async () => {
            try {
                const input = tool.inputSchema.parse(args) as Record<string, unknown>;
                const result = await tool.execute(input);
                await postToolResult(assignmentId, runId, toolCallId, result);
            } catch (err) {
                log.warn('Client tool execution failed', { toolName, error: String(err) });
                await postToolResult(assignmentId, runId, toolCallId, {
                    success: false,
                    output: {},
                    error: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
                });
            }
        })();
    }, [pendingClientTool, clearPendingClientTool]);

    // ── Unified approve handler for all destructive tools ─────────────────────

    const handleApprove = useCallback(() => {
        if (!pendingClientTool) return;
        const { assignmentId, runId, toolCallId, toolName, args } = pendingClientTool;
        const tool = getClientTool(toolName);
        if (!tool) return;
        clearPendingClientTool();

        void (async () => {
            try {
                const resolvedArgs = toolName === 'write_file'
                    ? resolveWriteFileAliases(args)
                    : args;

                const input = tool.inputSchema.parse(resolvedArgs) as Record<string, unknown>;

                let execOpts: ToolExecuteOptions | undefined;
                if (toolName === 'bash') {
                    setBashRunning({ command: args.command as string, lines: [] });
                    execOpts = {
                        onProgress: (chunk) => {
                            setBashRunning((prev) =>
                                prev
                                    ? { ...prev, lines: [...prev.lines, ...chunk.split('\n')] }
                                    : null
                            );
                        },
                    };
                }

                const result = await tool.execute(input, execOpts);
                setBashRunning(null);
                await postToolResult(assignmentId, runId, toolCallId, result);
            } catch (err) {
                log.warn('Client tool approval failed', { toolName, error: String(err) });
                setBashRunning(null);
                await postToolResult(assignmentId, runId, toolCallId, {
                    success: false,
                    output: {},
                    error: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
                });
            }
        })();
    }, [pendingClientTool, clearPendingClientTool]);

    const handleReject = useCallback((reason: string) => {
        if (!pendingClientTool) return;
        const { assignmentId, runId, toolCallId } = pendingClientTool;
        clearPendingClientTool();
        void postToolResult(assignmentId, runId, toolCallId, {
            success: false,
            output: {},
            error: reason,
        });
    }, [pendingClientTool, clearPendingClientTool]);

    // Special handler for ask_user: posts the user's answer directly as the result
    const handleAskUserAnswer = useCallback((answer: string) => {
        if (!pendingClientTool) return;
        const { assignmentId, runId, toolCallId } = pendingClientTool;
        clearPendingClientTool();
        void postToolResult(assignmentId, runId, toolCallId, {
            success: true,
            output: { answer },
        });
    }, [pendingClientTool, clearPendingClientTool]);

    // ── Prompt submit ─────────────────────────────────────────────────────────

    const handleSubmit = useCallback(async (text: string) => {
        setStatusMessage(null);
        setHistoryMessages(null);

        if (text.startsWith('/')) {
            clearEvents();
            try {
                const result = await handleSlashCommand(text, {
                    config,
                    assignment,
                    activeRunId,
                    stopStream,
                    newSession,
                    onStatusMessage: setStatusMessage,
                    onHistory: setHistoryMessages,
                    onUsernameChange: setUsername,
                    exit,
                });
                if (result?.message) setStatusMessage(result.message);

                if (text === '/login' && !assignment) {
                    setInitError(null);
                    await newSession();
                }
            } catch (err) {
                if (err instanceof AuthExpiredError) {
                    setStatusMessage('Session expired — type /login to re-authenticate');
                } else {
                    setStatusMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
            return;
        }

        if (!assignment) {
            setStatusMessage('Session not ready yet. Please wait a moment.');
            return;
        }

        try {
            const { run } = await createMessage(assignment.id, text);
            startStream(run.stream_url, assignment.id, run.id, text);
        } catch (err) {
            if (err instanceof AuthExpiredError) {
                setStatusMessage('Session expired — type /login to re-authenticate');
            } else {
                setStatusMessage(`Failed to send message: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }, [assignment, activeRunId, config, newSession, stopStream, startStream, clearEvents, exit]);

    // ── Approval view selector ────────────────────────────────────────────────

    function renderBottomArea() {
        // Bash live output (shown while command runs after approval)
        if (bashRunning) {
            return <BashRunningView command={bashRunning.command} lines={bashRunning.lines} />;
        }

        // Approval views for pending destructive tools
        if (pendingClientTool && !getClientTool(pendingClientTool.toolName)?.isReadOnly) {
            const { toolName, args } = pendingClientTool;

            if (toolName === 'bash') {
                return (
                    <BashApprovalView
                        command={args.command as string}
                        cwd={args.cwd as string | undefined}
                        timeoutSeconds={60}
                        onApprove={handleApprove}
                        onReject={handleReject}
                    />
                );
            }

            if (toolName === 'file_edit' || toolName === 'str_replace_file') {
                return (
                    <FileEditApprovalView
                        path={args.path as string}
                        oldString={args.old_string as string}
                        newString={args.new_string as string}
                        timeoutSeconds={60}
                        onApprove={handleApprove}
                        onReject={handleReject}
                    />
                );
            }

            if (toolName === 'write_file') {
                const resolved = resolveWriteFileAliases(args);
                return (
                    <WriteFileApprovalView
                        path={resolved.path as string}
                        content={resolved.content as string}
                        createDirs={args.create_dirs as boolean | undefined}
                        timeoutSeconds={60}
                        onApprove={handleApprove}
                        onReject={handleReject}
                    />
                );
            }

            if (toolName === 'ask_user') {
                return (
                    <AskUserView
                        question={args.question as string}
                        options={args.options as string[] | undefined}
                        timeoutSeconds={120}
                        onAnswer={handleAskUserAnswer}
                        onReject={handleReject}
                    />
                );
            }

            if (toolName === 'file_delete') {
                return (
                    <FileDeleteApprovalView
                        path={args.path as string}
                        recursive={args.recursive as boolean | undefined}
                        timeoutSeconds={60}
                        onApprove={handleApprove}
                        onReject={handleReject}
                    />
                );
            }

            if (toolName === 'file_move') {
                return (
                    <FileMoveApprovalView
                        source={args.source as string}
                        destination={args.destination as string}
                        timeoutSeconds={60}
                        onApprove={handleApprove}
                        onReject={handleReject}
                    />
                );
            }

            // Unknown approval-required tool — generic fallback
            return (
                <BashApprovalView
                    command={`[${toolName}] ${JSON.stringify(args).slice(0, 120)}`}
                    timeoutSeconds={60}
                    onApprove={handleApprove}
                    onReject={handleReject}
                />
            );
        }

        return <Prompt onSubmit={(text) => void handleSubmit(text)} isDisabled={isStreaming} />;
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <Box flexDirection="column" height="100%">
            <Box flexDirection="column" flexGrow={1}>
                {initError && (
                    <Box marginBottom={1}>
                        <Text color="red">⚠ {initError}</Text>
                    </Box>
                )}
                {!initError && sessionError && (
                    <Box marginBottom={1}>
                        <Text color="yellow">Session error: {sessionError}</Text>
                    </Box>
                )}
                {sessionLoading && (
                    <Text dimColor>Starting session…</Text>
                )}

                {historyMessages && (
                    <Box flexDirection="column" marginBottom={1}>
                        <MessageList messages={historyMessages} />
                    </Box>
                )}

                {turns.map((turnEvents, i) => (
                    <StreamView key={i} events={turnEvents} />
                ))}

                <StreamView events={streamEvents} />

                {streamError && (
                    <Box marginTop={1}>
                        <Text color="red">Stream error: {streamError}</Text>
                    </Box>
                )}

                {statusMessage && (
                    <Box marginTop={1}>
                        <Text color="cyan">{statusMessage}</Text>
                    </Box>
                )}
            </Box>

            <StatusBar
                serverUrl={config.server.url}
                username={username}
                isStreaming={isStreaming}
                lastRunStats={lastRunStats}
            />

            {renderBottomArea()}
        </Box>
    );
}
