import React from 'react';
import { Box, Text } from 'ink';
import { renderMarkdown } from '../../utils/markdown.js';

interface Props {
    content: string;
}

export function AssistantMessage({ content }: Props) {
    const rendered = renderMarkdown(content);
    return (
        <Box flexDirection="column" marginTop={1}>
            <Text color="green" bold>● Assistant</Text>
            <Box marginLeft={2}>
                <Text>{rendered}</Text>
            </Box>
        </Box>
    );
}
