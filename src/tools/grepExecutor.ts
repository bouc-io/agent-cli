import { execFile } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import type { ClientTool, ToolExecutionResult } from './types.js';

const execFileAsync = promisify(execFile);

const GrepInputSchema = z.object({
    pattern: z.string().min(1),
    path: z.string().optional(),
    case_insensitive: z.boolean().optional(),
    include_glob: z.string().optional(),
    context_lines: z.number().int().min(0).max(10).optional(),
    max_results: z.number().int().positive().optional(),
});

interface GrepMatch {
    file: string;
    line: number;
    content: string;
}

async function executeGrep(input: z.infer<typeof GrepInputSchema>): Promise<ToolExecutionResult> {
    const {
        pattern,
        path = '.',
        case_insensitive = false,
        include_glob,
        context_lines = 0,
        max_results = 200,
    } = input;

    let stdout = '';
    let usedRg = false;

    // Try ripgrep first (faster, respects .gitignore), fall back to grep
    try {
        const rgArgs = [
            '--line-number',
            '--no-heading',
            '--color=never',
            ...(case_insensitive ? ['--ignore-case'] : []),
            ...(include_glob ? ['--glob', include_glob] : []),
            ...(context_lines > 0 ? ['--context', String(context_lines)] : []),
            '-m', String(max_results),
            '--',
            pattern,
            path,
        ];
        const result = await execFileAsync('rg', rgArgs, { maxBuffer: 4 * 1024 * 1024 });
        stdout = result.stdout;
        usedRg = true;
    } catch (rgErr) {
        const rgCode = (rgErr as { code?: string | number }).code;
        if (rgCode === 'ENOENT') {
            // ripgrep not installed — fall back to grep
            const grepArgs = [
                '-rn',
                ...(case_insensitive ? ['-i'] : []),
                ...(include_glob ? ['--include', include_glob] : []),
                ...(context_lines > 0 ? [`-C${context_lines}`] : []),
                '--color=never',
                '-m', String(max_results),
                '--',
                pattern,
                path,
            ];
            try {
                const result = await execFileAsync('grep', grepArgs, { maxBuffer: 4 * 1024 * 1024 });
                stdout = result.stdout;
            } catch (grepErr) {
                // grep exits 1 on no matches — not an error
                if ((grepErr as { code?: number }).code !== 1) throw grepErr;
            }
        } else if (rgCode !== 1) {
            // rg exits 1 on no matches — not an error
            throw rgErr;
        }
    }

    // Parse match lines (file:line:content), skip context separators
    const matches: GrepMatch[] = [];
    for (const line of stdout.split('\n')) {
        if (!line.trim() || line === '--') continue;
        // Match lines use ':' separator; context lines use '-' (rg) — skip context
        const sep = usedRg ? ':' : ':';
        const firstColon = line.indexOf(sep);
        if (firstColon === -1) continue;
        const secondColon = line.indexOf(sep, firstColon + 1);
        if (secondColon === -1) continue;
        const lineNum = parseInt(line.slice(firstColon + 1, secondColon), 10);
        if (isNaN(lineNum)) continue;
        matches.push({
            file: line.slice(0, firstColon),
            line: lineNum,
            content: line.slice(secondColon + 1),
        });
        if (matches.length >= max_results) break;
    }

    return {
        success: true,
        output: {
            pattern,
            path,
            matches,
            count: matches.length,
            truncated: matches.length >= max_results,
        },
    };
}

export const GrepFilesTool: ClientTool<typeof GrepInputSchema> = {
    name: 'grep_files',
    description: 'Search for a regex pattern in files. Uses ripgrep if available, falls back to grep.',
    inputSchema: GrepInputSchema,
    requiresApproval: false,
    isReadOnly: true,
    execute: executeGrep,
};
