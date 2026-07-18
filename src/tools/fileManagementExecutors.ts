import { rename, rm, copyFile, unlink, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { ClientTool, ToolExecutionResult } from './types.js';

// ── file_delete ───────────────────────────────────────────────────────────────

const FileDeleteInputSchema = z.object({
    path: z.string().min(1),
    recursive: z.boolean().optional(),
});

export async function executeFileDelete(
    input: z.infer<typeof FileDeleteInputSchema>
): Promise<ToolExecutionResult & { isDirectory?: boolean }> {
    const resolved = resolve(input.path);
    try {
        const s = await stat(resolved);
        const isDirectory = s.isDirectory();
        await rm(resolved, { recursive: input.recursive ?? false, force: false });
        return {
            success: true,
            output: { path: resolved, type: isDirectory ? 'directory' : 'file' },
            isDirectory,
        };
    } catch (err) {
        return {
            success: false,
            output: { path: resolved },
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

export const FileDeleteTool: ClientTool<typeof FileDeleteInputSchema> = {
    name: 'file_delete',
    description: 'Delete a file or directory. Requires user approval.',
    inputSchema: FileDeleteInputSchema,
    requiresApproval: true,
    isReadOnly: false,
    execute: executeFileDelete,
};

// ── file_move ─────────────────────────────────────────────────────────────────

const FileMoveInputSchema = z.object({
    source: z.string().min(1),
    destination: z.string().min(1),
});

export async function executeFileMove(
    input: z.infer<typeof FileMoveInputSchema>
): Promise<ToolExecutionResult> {
    const src = resolve(input.source);
    const dst = resolve(input.destination);
    try {
        await rename(src, dst);
        return {
            success: true,
            output: { source: src, destination: dst },
        };
    } catch (err) {
        // EXDEV = cross-device rename (different filesystem) — fall back to copy + unlink
        if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
            try {
                await copyFile(src, dst);
                await unlink(src);
                return {
                    success: true,
                    output: { source: src, destination: dst },
                };
            } catch (copyErr) {
                return {
                    success: false,
                    output: { source: src, destination: dst },
                    error: copyErr instanceof Error ? copyErr.message : String(copyErr),
                };
            }
        }
        return {
            success: false,
            output: { source: src, destination: dst },
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

export const FileMoveTool: ClientTool<typeof FileMoveInputSchema> = {
    name: 'file_move',
    description: 'Move or rename a file or directory. Requires user approval.',
    inputSchema: FileMoveInputSchema,
    requiresApproval: true,
    isReadOnly: false,
    execute: executeFileMove,
};
