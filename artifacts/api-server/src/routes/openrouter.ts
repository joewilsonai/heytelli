import { Router, type IRouter } from "express";
import { eq, asc, desc, and, ne } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  db,
  conversations,
  messages,
  matches,
  screenshots,
  normalizeExtractedProfile,
  normalizeTranscript,
  type TranscriptTurn,
} from "@workspace/db";
import {
  CreateOpenrouterConversationBody,
  GetOpenrouterConversationParams,
  DeleteOpenrouterConversationParams,
  ListOpenrouterMessagesParams,
  SendOpenrouterMessageParams,
  SendOpenrouterMessageBody,
} from "@workspace/api-zod";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const MODEL = "x-ai/grok-4.20";
const MAX_IMAGES_PER_TURN = 8;

async function objectPathToCompressedDataUrl(objectPath: string): Promise<string | null> {
  try {
    const file = await storage.getObjectEntityFile(objectPath);
    const [buf] = await file.download();
    const out = await sharp(buf)
      .rotate()
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}

function formatTranscript(turns: TranscriptTurn[], matchName: string): string {
  if (turns.length === 0) return "";
  const her = matchName.trim() || "Her";
  const lines = turns.map((t) => `${t.speaker === "her" ? her : "Me"}: ${t.text}`);
  return lines.join("\n");
}

function profileSummary(match: {
  name: string;
  notes: string;
  vibeTags: string[];
  extractedProfile: ReturnType<typeof normalizeExtractedProfile>;
  transcript: TranscriptTurn[];
}): string {
  const p = match.extractedProfile;
  const s = p.scores;
  const fmt = (v: { value: number | null; rationale: string | null }) =>
    v.value == null ? "n/a" : `${v.value}/10${v.rationale ? ` — ${v.rationale}` : ""}`;
  const facts = [
    `Name: ${match.name}`,
    p.job ? `Job: ${p.job}` : null,
    p.location ? `Location: ${p.location}` : null,
    p.interests.length ? `Interests: ${p.interests.join(", ")}` : null,
    p.mentionedTopics.length ? `Topics mentioned: ${p.mentionedTopics.join(", ")}` : null,
    p.conversationTone ? `Tone: ${p.conversationTone}` : null,
    match.vibeTags.length ? `Vibe: ${match.vibeTags.join(", ")}` : null,
    `Sex potential: ${fmt(s.sexPotential)}`,
    `Conversion ability: ${fmt(s.conversionAbility)}`,
    `Chemistry: ${fmt(s.chemistry)}`,
    match.notes.trim() ? `User's private notes: ${match.notes.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const transcript = formatTranscript(match.transcript, match.name);
  if (!transcript) return facts;
  return `${facts}\n\nFull chat transcript (chronological):\n${transcript}`;
}

// Path to the editable prompt template at the monorepo root.
const PROMPT_FILE = path.resolve(process.cwd(), "../../grok_prompt.md");

type PromptSections = {
  base: string;
  noMatches: string;
  allMatches: string;
  singleMatch: string;
};

function parsePromptSections(md: string): PromptSections {
  const sections = new Map<string, string>();
  const lines = md.split("\n");
  let current: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (current) sections.set(current.toLowerCase(), buf.join("\n").trim());
  };
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      current = m[1];
      buf = [];
    } else if (current) {
      buf.push(line);
    }
  }
  flush();
  const get = (k: string): string => {
    const v = sections.get(k);
    if (!v) throw new Error(`grok_prompt.md missing "## ${k}" section`);
    return v;
  };
  return {
    base: get("base"),
    noMatches: get("no matches"),
    allMatches: get("all matches"),
    singleMatch: get("single match"),
  };
}

async function loadPromptSections(): Promise<PromptSections> {
  const raw = await readFile(PROMPT_FILE, "utf8");
  return parsePromptSections(raw);
}

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

async function loadPriorWingmanChats(
  matchId: number,
  excludeConversationId: number,
): Promise<string> {
  const pastConvs = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.matchId, matchId),
        ne(conversations.id, excludeConversationId),
      ),
    )
    .orderBy(asc(conversations.createdAt));
  if (pastConvs.length === 0) return "";

  const blocks: string[] = [];
  for (const c of pastConvs) {
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, c.id))
      .orderBy(asc(messages.createdAt));
    if (msgs.length === 0) continue;
    const when = new Date(c.createdAt).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const body = msgs
      .map((m) => `${m.role === "user" ? "User" : "You (Wingman)"}: ${m.content}`)
      .join("\n");
    blocks.push(`--- "${c.title}" (${when}) ---\n${body}`);
  }
  return blocks.join("\n\n");
}

async function buildSystemPrompt(
  matchId: number | null,
  currentConversationId: number | null = null,
): Promise<string> {
  const sections = await loadPromptSections();
  const base = sections.base;

  if (matchId == null) {
    const all = await db.select().from(matches).orderBy(desc(matches.updatedAt));
    if (all.length === 0) {
      return render(sections.noMatches, { BASE: base });
    }
    const roster = all
      .map((m, i) => {
        const norm = {
          ...m,
          extractedProfile: normalizeExtractedProfile(m.extractedProfile),
          transcript: normalizeTranscript(m.transcript),
        };
        return `--- Match #${i + 1} (id=${m.id}) ---\n${profileSummary(norm)}`;
      })
      .join("\n\n");
    return render(sections.allMatches, { BASE: base, ROSTER: roster });
  }

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) return base;
  const norm = {
    ...match,
    extractedProfile: normalizeExtractedProfile(match.extractedProfile),
    transcript: normalizeTranscript(match.transcript),
  };

  let summary = profileSummary(norm);
  if (currentConversationId != null) {
    const priorChats = await loadPriorWingmanChats(matchId, currentConversationId);
    if (priorChats) {
      summary += `\n\nPrevious wingman chats about ${match.name} (oldest first). The user's strategy or read on her may have evolved across these — treat the newest chat as the most current take, but consider the full arc:\n\n${priorChats}`;
    }
  }

  return render(sections.singleMatch, {
    BASE: base,
    MATCH_SUMMARY: summary,
  });
}

async function hasTranscript(matchId: number): Promise<boolean> {
  const [m] = await db
    .select({ transcript: matches.transcript })
    .from(matches)
    .where(eq(matches.id, matchId));
  return !!m && normalizeTranscript(m.transcript).length > 0;
}

async function loadMatchImages(matchId: number): Promise<string[]> {
  const shots = await db
    .select()
    .from(screenshots)
    .where(eq(screenshots.matchId, matchId))
    .orderBy(asc(screenshots.uploadedAt));
  const recent = shots.slice(-MAX_IMAGES_PER_TURN);
  const results = await Promise.all(recent.map((s) => objectPathToCompressedDataUrl(s.objectPath)));
  return results.filter((u): u is string => u !== null);
}

router.get("/openrouter/conversations", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.createdAt));
  res.json(rows);
});

router.post("/openrouter/conversations", async (req, res): Promise<void> => {
  const parsed = CreateOpenrouterConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db
    .insert(conversations)
    .values({
      title: parsed.data.title,
      matchId: parsed.data.matchId ?? null,
    })
    .returning();
  res.status(201).json(created);
});

router.get("/openrouter/conversations/:id", async (req, res): Promise<void> => {
  const params = GetOpenrouterConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.data.id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(asc(messages.createdAt));
  res.json({ ...conv, messages: msgs });
});

router.delete("/openrouter/conversations/:id", async (req, res): Promise<void> => {
  const params = DeleteOpenrouterConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(conversations)
    .where(eq(conversations.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/openrouter/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = ListOpenrouterMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, params.data.id))
    .orderBy(asc(messages.createdAt));
  res.json(msgs);
});

router.post("/openrouter/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = SendOpenrouterMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SendOpenrouterMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.data.id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  // Persist user message
  await db.insert(messages).values({
    conversationId: conv.id,
    role: "user",
    content: body.data.content,
  });

  const prior = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(asc(messages.createdAt));

  const systemPrompt = await buildSystemPrompt(conv.matchId, conv.id);
  // We now persist the parsed chat transcript on each match (see extraction.ts),
  // so the chat history is already inside the system prompt as text. Only fall
  // back to attaching screenshots when no transcript exists yet (e.g. legacy
  // matches that haven't been re-extracted).
  const images =
    conv.matchId != null && !(await hasTranscript(conv.matchId))
      ? await loadMatchImages(conv.matchId)
      : [];

  // Build chat history. Most messages are plain text. The most recent user
  // message is augmented with the current screenshots so the model can re-read
  // them on every turn (DB only persists text).
  const lastIdx = prior.length - 1;
  const chatMessages = [
    { role: "system" as const, content: systemPrompt },
    ...prior.map((m, i) => {
      if (i === lastIdx && m.role === "user" && images.length > 0) {
        return {
          role: "user" as const,
          content: [
            { type: "text" as const, text: m.content },
            ...images.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ],
        };
      }
      return {
        role: m.role as "user" | "assistant",
        content: m.content,
      };
    }),
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  try {
    const stream = await openrouter.chat.completions.create({
      model: MODEL,
      max_tokens: 8192,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: chatMessages as any,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    if (fullResponse.trim().length > 0) {
      await db.insert(messages).values({
        conversationId: conv.id,
        role: "assistant",
        content: fullResponse,
      });
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Chat stream failed");
    const message = err instanceof Error ? err.message : "Chat failed";
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
});

export default router;
