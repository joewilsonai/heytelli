import { FormEvent, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  getGetChatConversationQueryKey,
  getListChatConversationsQueryKey,
  useCreateChatConversation,
  useGetChatConversation,
  useListChatConversations,
  useListMatches,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus, Send } from "lucide-react";
import { ErrorBanner, LoadingState, PageHeader } from "@/components/State";
import { sendChatMessageStream } from "@/lib/chat-stream";
import { formatDate } from "@/lib/view-models";

function selectedConversationId(search: string): number | null {
  const value = new URLSearchParams(search).get("id");
  const id = value ? Number(value) : NaN;
  return Number.isFinite(id) ? id : null;
}

function selectedMatchId(search: string): number | null {
  const value = new URLSearchParams(search).get("match");
  const id = value ? Number(value) : NaN;
  return Number.isFinite(id) ? id : null;
}

export default function ChatPage() {
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const [path, rawSearch = ""] = location.split("?");
  const search = rawSearch ? `?${rawSearch}` : "";
  const selectedId = selectedConversationId(search);
  const matchId = selectedMatchId(search);
  const conversationsQuery = useListChatConversations();
  const matchesQuery = useListMatches();
  const createConversation = useCreateChatConversation();
  const [draftTitle, setDraftTitle] = useState("");
  const matches = matchesQuery.data ?? [];
  const selectedMatch = matches.find((match) => match.id === matchId);

  async function createNew(): Promise<void> {
    const title = draftTitle.trim() || (selectedMatch ? `Chat about ${selectedMatch.name}` : "HeyTelli chat");
    const conversation = await createConversation.mutateAsync({
      data: { title, matchId: selectedMatch?.id ?? null },
    });
    await queryClient.invalidateQueries({ queryKey: getListChatConversationsQueryKey() });
    setLocation(`${path}?id=${conversation.id}`);
  }

  return (
    <section className="page chat-page">
      <PageHeader
        eyebrow="HeyTelli chat"
        title="Ask for a clearer read"
        action={
          <button className="button primary" type="button" onClick={() => void createNew()} disabled={createConversation.isPending}>
            <Plus size={18} aria-hidden="true" />
            New
          </button>
        }
      />

      <div className="chat-layout">
        <aside className="conversation-list">
          <div className="conversation-create">
            <input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder={selectedMatch ? `About ${selectedMatch.name}` : "Conversation title"}
            />
          </div>
          {conversationsQuery.isLoading && <LoadingState label="Loading chats" />}
          {conversationsQuery.error && (
            <ErrorBanner message={conversationsQuery.error instanceof Error ? conversationsQuery.error.message : "Could not load chats"} />
          )}
          {(conversationsQuery.data ?? []).map((conversation) => (
            <Link
              key={conversation.id}
              className={`conversation-link ${selectedId === conversation.id ? "is-active" : ""}`}
              href={`/chat?id=${conversation.id}`}
            >
              <MessageSquare size={17} aria-hidden="true" />
              <span>{conversation.title}</span>
              <small>{formatDate(conversation.createdAt)}</small>
            </Link>
          ))}
        </aside>

        <div className="conversation-panel">
          {selectedId ? (
            <ConversationView id={selectedId} />
          ) : (
            <div className="empty-state">
              <h2>Start a chat</h2>
              <p>Pick a conversation or create a new one.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ConversationView({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const conversationQuery = useGetChatConversation(id);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messages = conversationQuery.data?.messages ?? [];
  const isBusy = Boolean(optimistic);
  const visibleMessages = useMemo(
    () => [
      ...messages,
      ...(optimistic ? [{ id: -1, role: "user", content: optimistic, createdAt: new Date().toISOString(), conversationId: id }] : []),
      ...(streaming ? [{ id: -2, role: "assistant", content: streaming, createdAt: new Date().toISOString(), conversationId: id }] : []),
    ],
    [id, messages, optimistic, streaming],
  );

  async function send(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const content = input.trim();
    if (!content || isBusy) return;
    setInput("");
    setOptimistic(content);
    setStreaming("");
    setError(null);
    try {
      await sendChatMessageStream({
        conversationId: id,
        content,
        onChunk: setStreaming,
      });
      await queryClient.invalidateQueries({ queryKey: getGetChatConversationQueryKey(id) });
      await queryClient.invalidateQueries({ queryKey: getListChatConversationsQueryKey() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setOptimistic(null);
      setStreaming("");
    }
  }

  if (conversationQuery.isLoading) return <LoadingState label="Loading conversation" />;
  if (conversationQuery.error) {
    return <ErrorBanner message={conversationQuery.error instanceof Error ? conversationQuery.error.message : "Could not load conversation"} />;
  }

  return (
    <div className="conversation-view">
      <div className="message-list">
        {visibleMessages.map((message) => (
          <div key={message.id} className={`message-bubble ${message.role === "user" ? "from-user" : "from-assistant"}`}>
            <p>{message.content}</p>
          </div>
        ))}
      </div>
      {error && <ErrorBanner message={error} />}
      <form className="chat-composer" onSubmit={(event) => void send(event)}>
        <textarea value={input} onChange={(event) => setInput(event.target.value)} rows={2} />
        <button className="button primary icon-only" type="submit" disabled={isBusy || !input.trim()} title="Send">
          <Send size={19} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
