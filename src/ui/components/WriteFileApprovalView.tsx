import React, { useEffect, useState, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface Props {
  path: string;
  content: string;
  createDirs?: boolean;
  timeoutSeconds?: number;
  onApprove: () => void;
  onReject: (reason: string) => void;
}

const PREVIEW_LINES = 12;

export function WriteFileApprovalView({
  path,
  content,
  createDirs,
  timeoutSeconds = 60,
  onApprove,
  onReject,
}: Props) {
  const [remaining, setRemaining] = useState(timeoutSeconds);
  const [existingLineCount, setExistingLineCount] = useState<number | null>(
    null,
  );
  const decided = useRef(false);

  // Check if the file already exists and how many lines it has
  useEffect(() => {
    void readFile(resolve(path), "utf8")
      .then((text) => setExistingLineCount(text.split("\n").length))
      .catch(() => setExistingLineCount(0)); // 0 = new file
  }, [path]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((r) => {
        const next = r - 1;
        if (next <= 0 && !decided.current) {
          decided.current = true;
          clearInterval(interval);
          onReject("Approval timed out — file not written");
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
      onReject("User rejected file write");
    }
  });

  const newLines = content.split("\n");
  const previewLines = newLines.slice(0, PREVIEW_LINES);
  const truncated = newLines.length > PREVIEW_LINES;

  const isNewFile = existingLineCount === 0;
  const fileStatus =
    existingLineCount === null
      ? ""
      : isNewFile
        ? "  (new file)"
        : `  (replaces existing file — ${existingLineCount} lines → ${newLines.length} lines)`;

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
        Agent wants to write a file
      </Text>

      <Box marginTop={1}>
        <Text dimColor>path: </Text>
        <Text color="cyan" bold>
          {path}
        </Text>
        {createDirs && <Text dimColor>{"  "}(create dirs)</Text>}
      </Box>

      {fileStatus !== "" && <Text dimColor>{fileStatus}</Text>}

      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>content preview:</Text>
        {previewLines.map((line, i) => (
          <Text key={i} dimColor>
            {"  "}
            {line}
          </Text>
        ))}
        {truncated && (
          <Text dimColor>
            {"  "}… ({newLines.length - PREVIEW_LINES} more lines)
          </Text>
        )}
      </Box>

      <Box marginTop={1}>
        <Text>Write this file? </Text>
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
