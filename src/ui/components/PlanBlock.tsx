import React from "react";
import { Box, Text } from "ink";
import type { PlanStep } from "../../api/stream.js";

interface Props {
  goal: string;
  steps: PlanStep[];
}

export function PlanBlock({ goal, steps }: Props) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="cyan" bold>
        ⚡ Plan: {goal}
      </Text>
      {steps.map((step) => (
        <Box key={step.id} marginLeft={2}>
          <Text dimColor>
            {step.id}. {step.description}
            {step.tool_intent ? (
              <Text color="yellow"> [{step.tool_intent}]</Text>
            ) : null}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
