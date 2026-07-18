import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

interface Props {
    toolName: string;
    /** If undefined the tool call is still in-flight */
    result?: {
        success: boolean;
        outputSummary: string;
    };
}

export function ToolCallRow({ toolName, result }: Props) {
    if (!result) {
        return (
            <Box>
                <Text color="yellow">
                    <Spinner type="dots" />
                </Text>
                <Text> {toolName}</Text>
            </Box>
        );
    }

    const icon = result.success ? '✓' : '✗';
    const color = result.success ? 'green' : 'red';

    return (
        <Box>
            <Text color={color}>{icon} </Text>
            <Text bold>{toolName}</Text>
            <Text dimColor> — {result.outputSummary}</Text>
        </Box>
    );
}
