import { apiGet, apiPost, apiDelete } from "./client.js";

export interface Assignment {
  id: string;
  user_id: string;
  title: string;
  metadata: Record<string, unknown>;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssignmentListResponse {
  data: Assignment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export async function listAssignments(
  page = 1,
  limit = 20,
): Promise<AssignmentListResponse> {
  return apiGet<AssignmentListResponse>(
    `/v1/assignments?page=${page}&limit=${limit}&sort=updated_at&order=desc`,
  );
}

export async function createAssignment(title: string): Promise<Assignment> {
  return apiPost<Assignment>("/v1/assignments", { title });
}

export async function getAssignment(id: string): Promise<Assignment> {
  return apiGet<Assignment>(`/v1/assignments/${id}`);
}

export async function updateAssignment(
  id: string,
  title: string,
): Promise<void> {
  await apiPost<void>(`/v1/assignments/${id}`, { title });
}

export async function archiveAssignment(id: string): Promise<void> {
  await apiPost<void>(`/v1/assignments/${id}/archive`);
}

export async function deleteAssignment(id: string): Promise<void> {
  await apiDelete(`/v1/assignments/${id}`);
}
