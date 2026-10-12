import React, { useEffect, useState, useRef } from "react";
import { Box, Text, useInput } from "ink";

const MAX_DIFF_LINES = 12;

interface Props {
  path: string;
  oldString: string;
  newString: string;
  timeoutSeconds?: number;
  onApprove: () => void;
  onReject: (reason: string) => void;
}

export function FileEditApprovalView({
  path,
  oldString,
  newString,
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
          onReject("Approval timed out — edit not applied");
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
      onReject("User rejected file edit");
    }
  });

  const oldLines = oldString.split("\n");
  const newLines = newString.split("\n");
  const showOld = oldLines.slice(0, MAX_DIFF_LINES);
  const showNew = newLines.slice(0, MAX_DIFF_LINES);

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
        Agent wants to edit a file
      </Text>

      <Box marginTop={1}>
        <Text dimColor>path: </Text>
        <Text color="cyan" bold>
          {path}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>remove:</Text>
        {showOld.map((line, i) => (
          <Text key={i} color="red">
            {"- "}
            {line}
          </Text>
        ))}
        {oldLines.length > MAX_DIFF_LINES && (
          <Text dimColor>
            {"  "}… ({oldLines.length - MAX_DIFF_LINES} more lines)
          </Text>
        )}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>add:</Text>
        {showNew.map((line, i) => (
          <Text key={i} color="green">
            {"+ "}
            {line}
          </Text>
        ))}
        {newLines.length > MAX_DIFF_LINES && (
          <Text dimColor>
            {"  "}… ({newLines.length - MAX_DIFF_LINES} more lines)
          </Text>
        )}
      </Box>

      <Box marginTop={1}>
        <Text>Apply this edit? </Text>
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
