import React, { useEffect, useState, useRef } from "react";
import { Box, Text, useInput } from "ink";

interface Props {
  question: string;
  options?: string[];
  timeoutSeconds?: number;
  onAnswer: (answer: string) => void;
  onReject: (reason: string) => void;
}

// Interactive question prompt displayed when the agent calls ask_user.
// If options are provided, the user presses a number to select.
// Otherwise, the user types a free-text answer and presses Enter.
export function AskUserView({
  question,
  options,
  timeoutSeconds = 120,
  onAnswer,
  onReject,
}: Props) {
  const [remaining, setRemaining] = useState(timeoutSeconds);
  const [textInput, setTextInput] = useState("");
  const decided = useRef(false);
  const hasOptions = options && options.length > 0;

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((r) => {
        const next = r - 1;
        if (next <= 0 && !decided.current) {
          decided.current = true;
          clearInterval(interval);
          onReject("Question timed out — no answer provided");
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onReject]);

  useInput((input, key) => {
    if (decided.current) return;

    if (key.escape) {
      decided.current = true;
      onReject("User dismissed question");
      return;
    }

    if (hasOptions) {
      const n = parseInt(input, 10);
      if (!isNaN(n) && n >= 1 && n <= options!.length) {
        decided.current = true;
        onAnswer(options![n - 1]);
      }
    } else {
      if (key.return) {
        const answer = textInput.trim();
        if (answer) {
          decided.current = true;
          onAnswer(answer);
        }
        return;
      }
      if (key.backspace || key.delete) {
        setTextInput((prev) => prev.slice(0, -1));
        return;
      }
      // Printable characters only
      if (!key.ctrl && !key.meta && input && input.length === 1) {
        setTextInput((prev) => prev + input);
      }
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="blue"
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      <Text color="blue" bold>
        Agent is asking a question
      </Text>

      <Box marginTop={1}>
        <Text bold>{question}</Text>
      </Box>

      {hasOptions ? (
        <Box flexDirection="column" marginTop={1}>
          {options!.map((opt, i) => (
            <Box key={i}>
              <Text color="cyan" bold>
                [{i + 1}]{" "}
              </Text>
              <Text>{opt}</Text>
            </Box>
          ))}
          <Box marginTop={1}>
            <Text dimColor>
              Press a number to select · Esc to dismiss · (auto-reject in{" "}
              {remaining}s)
            </Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text dimColor>{"> "}</Text>
            <Text color="white">{textInput}</Text>
            <Text color="white" bold>
              {"▌"}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>
              Type your answer · Enter to submit · Esc to dismiss · (auto-reject
              in {remaining}s)
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
