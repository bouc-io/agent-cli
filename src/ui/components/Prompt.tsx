import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";

interface Props {
  onSubmit: (text: string) => void;
  isDisabled?: boolean;
  prefix?: string;
}

const MAX_HISTORY = 100;

/**
 * Single-line input with history cycling (up/down arrows).
 * Disabled while a run is streaming.
 */
export function Prompt({ onSubmit, isDisabled = false, prefix = "> " }: Props) {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [savedDraft, setSavedDraft] = useState("");

  useInput((input, key) => {
    if (isDisabled) return;

    if (key.return) {
      const trimmed = value.trim();
      if (!trimmed) return;
      setHistory((prev) => {
        const next = [...prev.filter((h) => h !== trimmed), trimmed];
        return next.slice(-MAX_HISTORY);
      });
      setHistoryIndex(null);
      setSavedDraft("");
      setValue("");
      onSubmit(trimmed);
      return;
    }

    if (key.backspace || key.delete) {
      setValue((prev) => prev.slice(0, -1));
      return;
    }

    if (key.upArrow) {
      setHistory((hist) => {
        const max = hist.length - 1;
        if (max < 0) return hist;
        const newIndex =
          historyIndex === null ? max : Math.max(0, historyIndex - 1);
        if (historyIndex === null) setSavedDraft(value);
        setHistoryIndex(newIndex);
        setValue(hist[newIndex]);
        return hist;
      });
      return;
    }

    if (key.downArrow) {
      if (historyIndex === null) return;
      setHistory((hist) => {
        const newIndex = historyIndex + 1;
        if (newIndex >= hist.length) {
          setHistoryIndex(null);
          setValue(savedDraft);
        } else {
          setHistoryIndex(newIndex);
          setValue(hist[newIndex]);
        }
        return hist;
      });
      return;
    }

    if (key.ctrl && input === "c") {
      // Let Ink/process handle Ctrl+C
      return;
    }

    // Regular printable character
    if (input && !key.ctrl && !key.meta) {
      setValue((prev) => prev + input);
      setHistoryIndex(null);
    }
  });

  return (
    <Box>
      <Text color={isDisabled ? "gray" : "green"}>{prefix}</Text>
      <Text>{value}</Text>
      {!isDisabled && <Text inverse> </Text>}
    </Box>
  );
}
