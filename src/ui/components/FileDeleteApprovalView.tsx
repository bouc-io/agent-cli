import React, { useEffect, useState, useRef } from "react";
import { Box, Text, useInput } from "ink";

interface Props {
  path: string;
  recursive?: boolean;
  timeoutSeconds?: number;
  onApprove: () => void;
  onReject: (reason: string) => void;
}

export function FileDeleteApprovalView({
  path,
  recursive,
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
          onReject("Approval timed out — file not deleted");
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onReject]);

  useInput((input, key) => {
    if (decided.current) return;
    if (input === "y" || input === "Y") {
      decided.current = true;
      onApprove();
    } else if (input === "n" || input === "N" || key.escape) {
      decided.current = true;
      onReject("User rejected file deletion");
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="red"
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      <Text color="red" bold>
        Agent wants to delete a path
      </Text>

      <Box marginTop={1}>
        <Text dimColor>path: </Text>
        <Text color="red" bold>
          {path}
        </Text>
      </Box>

      {recursive && (
        <Box>
          <Text color="red">
            ⚠ recursive — entire directory tree will be deleted
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text>Delete this? </Text>
        <Text color="green" bold>
          [y]
        </Text>
        <Text>es / </Text>
        <Text color="red" bold>
          [N]
        </Text>
        <Text>o</Text>
        <Text dimColor>
          {"  "}(auto-reject in {remaining}s)
        </Text>
      </Box>
    </Box>
  );
}
