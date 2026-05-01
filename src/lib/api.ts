import type { ChatMessage } from "./chat";

export type Conversation = {
  id: string;
  userSessionId?: string;
  user_session_id?: string;
  title: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
};

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export function listConversations(sessionId: string) {
  return request<Conversation[]>(`/api/conversations?sessionId=${encodeURIComponent(sessionId)}`);
}

export function createConversation(sessionId: string, title: string) {
  return request<Conversation>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ sessionId, title }),
  });
}

export function deleteConversation(id: string, sessionId: string) {
  return request<void>(`/api/conversations/${encodeURIComponent(id)}?sessionId=${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
}

export function listMessages(conversationId: string, sessionId: string) {
  return request<ChatMessage[]>(`/api/conversations/${encodeURIComponent(conversationId)}/messages?sessionId=${encodeURIComponent(sessionId)}`);
}

export function saveMessage(conversationId: string, sessionId: string, role: ChatMessage["role"], content: string) {
  return request<{ id: string }>("/api/messages", {
    method: "POST",
    body: JSON.stringify({ conversationId, sessionId, role, content }),
  });
}

export function submitFeedback(messageId: string, sessionId: string, rating: "up" | "down") {
  return request<void>("/api/feedback", {
    method: "POST",
    body: JSON.stringify({ messageId, sessionId, rating }),
  });
}

export function removeFeedback(messageId: string, sessionId: string) {
  return request<void>(`/api/feedback/${encodeURIComponent(messageId)}?sessionId=${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
}