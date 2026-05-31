import { getStoredToken, resolveApiUrl } from "./auth";

export async function sendChatMessageStream(input: {
  conversationId: number;
  content: string;
  onChunk: (text: string) => void;
}): Promise<void> {
  const token = getStoredToken();
  const response = await fetch(
    resolveApiUrl(`/api/chat/conversations/${input.conversationId}/messages`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ content: input.content }),
    },
  );

  if (!response.ok || !response.body) {
    throw new Error(`Chat request failed with HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const line = event.split("\n").find((candidate) => candidate.startsWith("data: "));
      if (!line) continue;
      const payload: unknown = JSON.parse(line.slice(6));
      if (!payload || typeof payload !== "object") continue;
      const content = (payload as { content?: unknown }).content;
      const error = (payload as { error?: unknown }).error;
      if (typeof error === "string" && error.trim()) throw new Error(error);
      if (typeof content === "string") {
        accumulated += content;
        input.onChunk(accumulated);
      }
    }
  }
}
