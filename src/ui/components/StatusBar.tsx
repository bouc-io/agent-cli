import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { RunStats } from '../hooks/useStream.js';

interface Props {
    serverUrl: string;
    username?: string;
    isStreaming: boolean;
    lastRunStats?: RunStats | null;
}

export function StatusBar({ serverUrl, username, isStreaming, lastRunStats }: Props) {
    const parts: string[] = [serverUrl];
    if (username) parts.push(`@${username}`);

    const tokenLabel = lastRunStats?.tokensUsed !== undefined
        ? `↑ ${(lastRunStats.tokensUsed / 1000).toFixed(1)}k tokens`
        : null;
    const costLabel = lastRunStats?.costUsd !== undefined
        ? `$${lastRunStats.costUsd.toFixed(4)}`
        : null;

    return (
        <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} paddingX={1}>
            <Text dimColor>{parts.join(' · ')}</Text>
            {(tokenLabel || costLabel) && !isStreaming && (
                <Text dimColor>
                    {'  · '}
                    {[tokenLabel, costLabel].filter(Boolean).join(' · ')}
                </Text>
            )}
            {isStreaming && (
                <Box marginLeft={2}>
                    <Text color="cyan"><Spinner type="dots" /></Text>
                    <Text color="cyan"> running</Text>
                </Box>
            )}
        </Box>
    );
}
