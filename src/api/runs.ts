import { apiPost } from './client.js';

export async function cancelRun(assignmentId: string, runId: string): Promise<void> {
    await apiPost<void>(`/v1/assignments/${assignmentId}/runs/${runId}/cancel`);
}
