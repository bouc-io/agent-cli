import { useState, useCallback } from 'react';
import type { Assignment } from '../../api/assignments.js';
import { createAssignment } from '../../api/assignments.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('use-assignment');

export interface UseAssignmentResult {
    assignment: Assignment | null;
    isLoading: boolean;
    error: string | null;
    /** Start a new session — creates a fresh assignment on the server. */
    newSession: () => Promise<void>;
}

/**
 * Manages the single active assignment for this CLI session.
 *
 * Assignments are an internal API detail; the user never sees or manages them.
 * A new assignment is auto-created on startup and on /new.
 */
export function useAssignment(): UseAssignmentResult {
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const newSession = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const title = `CLI ${new Date().toLocaleString()}`;
            const created = await createAssignment(title);
            setAssignment(created);
            log.info('Session started', { id: created.id });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
            log.error('Failed to start session', { error: msg });
        } finally {
            setIsLoading(false);
        }
    }, []);

    return { assignment, isLoading, error, newSession };
}
