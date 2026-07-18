import React from 'react';
import { Box, Text } from 'ink';
import { renderMarkdown } from '../../utils/markdown.js';

export interface HistoryMessage {
    id: string;
    role: string;
    content: string;
    created_at: string;
}

interface Props {
    messages: HistoryMessage[];
}

export function MessageList({ messages }: Props) {
    if (messages.length === 0) {
        return <Text dimColor>No messages yet.</Text>;
    }

    return (
        <Box flexDirection="column">
            {messages.map((msg) => {
                const isUser = msg.role === 'user';
                const label = isUser ? '▸ You' : '● Assistant';
                const color = isUser ? 'blue' : 'green';
                const time = new Date(msg.created_at).toLocaleTimeString();

                return (
                    <Box key={msg.id} flexDirection="column" marginBottom={1}>
                        <Box>
                            <Text color={color} bold>{label}</Text>
                            <Text dimColor> {time}</Text>
                        </Box>
                        <Box marginLeft={2}>
                            <Text>
                                {isUser ? msg.content : renderMarkdown(msg.content)}
                            </Text>
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
}
