import { z } from 'zod';
import type { ClientTool, ToolExecutionResult } from './types.js';

export const AskUserInputSchema = z.object({
    question: z.string().min(1),
    options: z.array(z.string()).optional(),
});

export type AskUserInput = z.infer<typeof AskUserInputSchema>;

// The actual answer is collected by AskUserView in the interactive UI.
// This execute function is only reached in non-interactive contexts (e.g. tests)
// or if something bypasses the normal UI path.
async function executeAskUser(_input: AskUserInput): Promise<ToolExecutionResult> {
    return {
        success: false,
        output: {},
        error: 'ask_user requires interactive UI — cannot execute programmatically',
    };
}

export const AskUserTool: ClientTool<typeof AskUserInputSchema> = {
    name: 'ask_user',
    description: 'Ask the user a question. Shows a prompt with optional selectable answers.',
    inputSchema: AskUserInputSchema,
    requiresApproval: true,
    isReadOnly: false,
    execute: executeAskUser,
};
