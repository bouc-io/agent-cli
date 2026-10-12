import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

const MAX_VISIBLE_LINES = 20;

interface Props {
  command: string;
  lines: string[];
}

export function BashRunningView({ command, lines }: Props) {
  const displayLines =
    lines.length > MAX_VISIBLE_LINES ? lines.slice(-MAX_VISIBLE_LINES) : lines;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      <Box gap={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text color="cyan" bold>
          Running command
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color="white">{"$ "}</Text>
        <Text color="cyan">{command}</Text>
      </Box>

      {displayLines.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {lines.length > MAX_VISIBLE_LINES && (
            <Text dimColor>
              {" "}
              … ({lines.length - MAX_VISIBLE_LINES} earlier lines hidden)
            </Text>
          )}
          {displayLines.map((line, i) => (
            <Text key={i} dimColor>
              {"  "}
              {line}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
