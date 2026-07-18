import { execFile } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import type { ClientTool, ToolExecutionResult } from './types.js';

const execFileAsync = promisify(execFile);

const ProcessListInputSchema = z.object({
    filter: z.string().optional(),
});

interface ProcessEntry {
    pid: number;
    cpu: number;
    mem: number;
    name: string;
    command: string;
}

async function executeProcessList(
    input: z.infer<typeof ProcessListInputSchema>
): Promise<ToolExecutionResult> {
    try {
        // POSIX-compatible flags work on both macOS and Linux
        const { stdout } = await execFileAsync(
            'ps',
            ['-e', '-o', 'pid=,pcpu=,pmem=,comm=,args='],
            { maxBuffer: 2 * 1024 * 1024 }
        );

        const processes: ProcessEntry[] = [];
        for (const line of stdout.trim().split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            // Fields: pid pcpu pmem comm args (args may contain spaces)
            const parts = trimmed.split(/\s+/);
            if (parts.length < 4) continue;
            const pid = parseInt(parts[0], 10);
            const cpu = parseFloat(parts[1]);
            const mem = parseFloat(parts[2]);
            const name = parts[3];
            const command = parts.slice(3).join(' ');
            if (isNaN(pid)) continue;
            processes.push({ pid, cpu, mem, name, command });
        }

        const filtered = input.filter
            ? processes.filter(
                (p) =>
                    p.name.toLowerCase().includes(input.filter!.toLowerCase()) ||
                    p.command.toLowerCase().includes(input.filter!.toLowerCase())
            )
            : processes;

        return {
            success: true,
            output: { processes: filtered, count: filtered.length, filter: input.filter ?? null },
        };
    } catch (err) {
        return {
            success: false,
            output: { processes: [], count: 0 },
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

export const ProcessListTool: ClientTool<typeof ProcessListInputSchema> = {
    name: 'process_list',
    description: 'List running processes. Optional filter by name or command.',
    inputSchema: ProcessListInputSchema,
    requiresApproval: false,
    isReadOnly: true,
    execute: executeProcessList,
};
