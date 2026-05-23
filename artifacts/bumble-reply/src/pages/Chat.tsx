import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  useListOpenrouterConversations,
  useCreateOpenrouterConversation,
  useGetOpenrouterConversation,
  useDeleteOpenrouterConversation,
  useListMatches,
  getGetOpenrouterConversationQueryKey,
  getListOpenrouterConversationsQueryKey,
} from "@workspace/api-client-react";
import type {
  OpenrouterConversation,
  OpenrouterMessage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  Send,
  Sparkles,
  Trash2,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

function MessageBubble({ role, content }: { role: string; content: string }) {
  const isUser = role === "user";
  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed shadow-sm",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md",
        )}
      >
        {content || (isUser ? "" : "…")}
      </div>
    </div>
  );
}

function NewChatComposer({
  onCreated,
}: {
  onCreated: (id: number) => void;
}) {
  const { data: matches = [] } = useListMatches();
  const [title, setTitle] = useState("");
  const [matchId, setMatchId] = useState<string>("all");
  const create = useCreateOpenrouterConversation();
  const qc = useQueryClient();

  async function submit() {
    const finalMatchId = matchId === "all" ? null : Number(matchId);
    const finalTitle =
      title.trim() ||
      (finalMatchId == null
        ? "All matches chat"
        : `Chat about ${matches.find((m) => m.id === finalMatchId)?.name ?? "match"}`);
    const created = await create.mutateAsync({
      data: { title: finalTitle, matchId: finalMatchId },
    });
    await qc.invalidateQueries({ queryKey: getListOpenrouterConversationsQueryKey() });
    onCreated(created.id);
  }

  return (
    <Card className="p-5 rounded-2xl">
      <h3 className="font-semibold text-base mb-3">Start a new chat with Grok</h3>
      <div className="space-y-3">
        <Select value={matchId} onValueChange={setMatchId}>
          <SelectTrigger data-testid="select-chat-match">
            <SelectValue placeholder="Who do you want to talk about?" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All matches (general)</SelectItem>
            {matches.map((m) => (
              <SelectItem key={m.id} value={String(m.id)}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea
          placeholder="Optional title (auto-generated if blank)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          rows={1}
          className="resize-none"
        />
        <Button
          onClick={submit}
          disabled={create.isPending}
          className="w-full rounded-full font-semibold"
          data-testid="button-create-chat"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          {create.isPending ? "Creating…" : "Start chat"}
        </Button>
      </div>
    </Card>
  );
}

function ConversationView({ id }: { id: number }) {
  const { data: conv, refetch } = useGetOpenrouterConversation(id);
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const del = useDeleteOpenrouterConversation();
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [optimisticUser, setOptimisticUser] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages: OpenrouterMessage[] = conv?.messages ?? [];

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, streamingText, optimisticUser]);

  async function send() {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    setOptimisticUser(text);
    setStreamingText("");
    setIsStreaming(true);

    try {
      const res = await fetch(`/api/openrouter/conversations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const ev of events) {
          const line = ev.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (typeof payload.content === "string") {
              acc += payload.content;
              setStreamingText(acc);
            }
            if (payload.error) throw new Error(payload.error);
          } catch {
            // ignore non-JSON
          }
        }
      }
    } catch (err) {
      console.error("Chat error", err);
      setStreamingText(
        (s) => s + `\n\n[Error: ${err instanceof Error ? err.message : "stream failed"}]`,
      );
    } finally {
      setIsStreaming(false);
      setOptimisticUser(null);
      setStreamingText("");
      await refetch();
      await qc.invalidateQueries({ queryKey: getGetOpenrouterConversationQueryKey(id) });
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this conversation?")) return;
    await del.mutateAsync({ id });
    await qc.invalidateQueries({ queryKey: getListOpenrouterConversationsQueryKey() });
    navigate("/chat");
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-2 p-4 border-b border-border bg-card/60 backdrop-blur">
        <div className="min-w-0">
          <h2 className="font-semibold truncate" data-testid="text-conversation-title">
            {conv?.title ?? "…"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {conv?.matchId == null ? "All matches" : `Match #${conv?.matchId}`} ·
            Powered by Grok
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          data-testid="button-delete-conversation"
          aria-label="Delete conversation"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
      >
        {messages.length === 0 && !optimisticUser && (
          <div className="text-center text-muted-foreground py-12 text-sm">
            Ask anything — about her vibe, what to say next, how to escalate.
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} role={m.role} content={m.content} />
        ))}
        {optimisticUser && <MessageBubble role="user" content={optimisticUser} />}
        {isStreaming && <MessageBubble role="assistant" content={streamingText} />}
      </div>

      <div className="border-t border-border p-3 bg-card/60 backdrop-blur">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask Grok about her, the conversation, her pics…"
            rows={2}
            className="resize-none rounded-2xl"
            disabled={isStreaming}
            data-testid="input-chat-message"
          />
          <Button
            onClick={send}
            disabled={isStreaming || !input.trim()}
            className="rounded-full h-11 w-11 p-0 flex-shrink-0"
            data-testid="button-send-message"
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { data: convs = [] } = useListOpenrouterConversations();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const selectedId = params.get("id") ? Number(params.get("id")) : null;
  const newMatchId = params.get("match") ? Number(params.get("match")) : null;

  const list = convs as OpenrouterConversation[];

  // Auto-create a conversation when ?match=N is provided and we don't already
  // have an open one for that match.
  const create = useCreateOpenrouterConversation();
  const { data: matches = [] } = useListMatches();
  const qc = useQueryClient();
  const autoCreatedRef = useRef(false);
  useEffect(() => {
    if (newMatchId == null || autoCreatedRef.current) return;
    autoCreatedRef.current = true;
    (async () => {
      const match = matches.find((m) => m.id === newMatchId);
      const title = match ? `Chat about ${match.name}` : "Chat about match";
      const created = await create.mutateAsync({
        data: { title, matchId: newMatchId },
      });
      await qc.invalidateQueries({ queryKey: getListOpenrouterConversationsQueryKey() });
      navigate(`/chat?id=${created.id}`, { replace: true });
    })();
  }, [newMatchId, matches, create, qc, navigate]);

  return (
    <div className="min-h-[100dvh] w-full bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/30 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-6xl mx-auto p-4 md:p-6 relative z-10 h-[100dvh] flex flex-col">
        <header className="flex items-center justify-between gap-4 mb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" aria-label="Back" data-testid="button-back-to-matches">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="inline-flex items-center justify-center p-2.5 bg-primary/20 rounded-xl">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-extrabold tracking-tight leading-tight">
                Wingman Chat
              </h1>
              <p className="text-muted-foreground text-xs">
                Talk to Grok about any of your matches
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 flex-1 min-h-0">
          <aside className="flex flex-col gap-3 min-h-0">
            <NewChatComposer onCreated={(id) => navigate(`/chat?id=${id}`)} />
            <Card className="rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col">
              <div className="px-4 py-3 border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Conversations
              </div>
              <div className="overflow-y-auto flex-1 divide-y divide-border">
                {list.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    No chats yet
                  </div>
                )}
                {list.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/chat?id=${c.id}`)}
                    className={cn(
                      "w-full text-left p-3 hover:bg-muted/50 transition flex items-center gap-2",
                      selectedId === c.id && "bg-muted/70",
                    )}
                    data-testid={`button-conversation-${c.id}`}
                  >
                    <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="truncate text-sm">{c.title}</span>
                  </button>
                ))}
              </div>
            </Card>
          </aside>

          <main className="min-h-0">
            <Card className="rounded-2xl h-full overflow-hidden flex flex-col min-h-[60vh]">
              {selectedId == null ? (
                <div className="flex-1 flex items-center justify-center text-center p-8 text-muted-foreground text-sm">
                  Pick a conversation from the list or start a new one.
                </div>
              ) : (
                <ConversationView id={selectedId} />
              )}
            </Card>
          </main>
        </div>
      </div>
    </div>
  );
}
