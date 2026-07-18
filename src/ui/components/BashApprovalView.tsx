import React, { useEffect, useState, useRef } from 'react';
import { Box, Text, useInput } from 'ink';

interface BashApprovalViewProps {
    command: string;
    cwd?: string;
    timeoutSeconds?: number;
    onApprove: () => void;
    onReject: (reason: string) => void;
}

/**
 * Interactive terminal prompt displayed when the agent wants to run a bash command.
 * The user must press y to approve or n (or Escape) to reject.
 * Auto-rejects after timeoutSeconds with no interaction.
 */
export function BashApprovalView({
    command,
    cwd,
    timeoutSeconds = 60,
    onApprove,
    onReject,
}: BashApprovalViewProps) {
    const [remaining, setRemaining] = useState(timeoutSeconds);
    const decided = useRef(false);

    // Countdown timer — auto-reject on expiry
    useEffect(() => {
        const interval = setInterval(() => {
            setRemaining((r) => {
                const next = r - 1;
                if (next <= 0 && !decided.current) {
                    decided.current = true;
                    clearInterval(interval);
                    onReject('Approval timed out — command not executed');
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
            onReject('User rejected command execution');
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
            <Text color="yellow" bold>
                Agent wants to run a shell command
            </Text>

            <Box marginTop={1}>
                <Text color="white">{'$ '}</Text>
                <Text color="cyan" bold>
                    {command}
                </Text>
            </Box>

            {cwd && (
                <Box>
                    <Text dimColor>cwd: {cwd}</Text>
                </Box>
            )}

            <Box marginTop={1}>
                <Text>Run this command? </Text>
                <Text color="green" bold>[y]</Text>
                <Text>es / </Text>
                <Text color="red" bold>[N]</Text>
                <Text>o</Text>
                <Text dimColor>  (auto-reject in {remaining}s)</Text>
            </Box>
        </Box>
    );
}
