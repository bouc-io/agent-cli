import React, { useEffect, useState, useRef } from 'react';
import { Box, Text, useInput } from 'ink';

interface Props {
    source: string;
    destination: string;
    timeoutSeconds?: number;
    onApprove: () => void;
    onReject: (reason: string) => void;
}

export function FileMoveApprovalView({
    source,
    destination,
    timeoutSeconds = 60,
    onApprove,
    onReject,
}: Props) {
    const [remaining, setRemaining] = useState(timeoutSeconds);
    const decided = useRef(false);

    useEffect(() => {
        const interval = setInterval(() => {
            setRemaining((r) => {
                const next = r - 1;
                if (next <= 0 && !decided.current) {
                    decided.current = true;
                    clearInterval(interval);
                    onReject('Approval timed out — file not moved');
                }
                return next;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [onReject]);

    useInput((input, key) => {
        if (decided.current) return;
        if (input === 'y' || input === 'Y') {
            decided.current = true;
            onApprove();
        } else if (input === 'n' || input === 'N' || key.escape) {
            decided.current = true;
            onReject('User rejected file move');
        }
    });

    return (
        <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="yellow"
            paddingX={2}
            paddingY={1}
            marginY={1}
        >
            <Text color="yellow" bold>Agent wants to move a file</Text>

            <Box marginTop={1} flexDirection="column">
                <Box>
                    <Text dimColor>from: </Text>
                    <Text color="cyan">{source}</Text>
                </Box>
                <Box>
                    <Text dimColor>  to: </Text>
                    <Text color="green" bold>{destination}</Text>
                </Box>
            </Box>

            <Box marginTop={1}>
                <Text>Move this file? </Text>
                <Text color="green" bold>[y]</Text>
                <Text>es / </Text>
                <Text color="red" bold>[N]</Text>
                <Text>o</Text>
                <Text dimColor>{'  '}(auto-reject in {remaining}s)</Text>
            </Box>
        </Box>
    );
}
