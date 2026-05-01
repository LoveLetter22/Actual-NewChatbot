import { useState } from "react";

const SESSION_KEY = "techassist_session_id";

function getOrCreateSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function useSessionId() {
  const [sessionId] = useState(getOrCreateSessionId);
  return sessionId;
}
