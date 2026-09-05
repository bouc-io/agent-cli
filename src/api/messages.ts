import { apiGet, apiPost } from "./client.js";

export interface Message {
  id: string;
  assignment_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface MessageListResponse {
  data: Message[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface CreateMessageResponse {
  assignment_id: string;
  user_message: Message;
  run: {
    id: string;
    status: string;
    stream_url: string;
  };
}

export async function createMessage(
  assignmentId: string,
  content: string,
): Promise<CreateMessageResponse> {
  return apiPost<CreateMessageResponse>(
    `/v1/assignments/${assignmentId}/messages`,
    {
      content,
      options: { client_type: "cli" },
    },
  );
}

export async function listMessages(
  assignmentId: string,
  limit = 20,
): Promise<MessageListResponse> {
  return apiGet<MessageListResponse>(
    `/v1/assignments/${assignmentId}/messages?limit=${limit}&sort=created_at&order=desc`,
  );
}
