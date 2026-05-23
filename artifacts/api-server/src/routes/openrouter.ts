import { Router, type IRouter } from "express";
import { eq, asc, desc } from "drizzle-orm";
import sharp from "sharp";
import {
  db,
  conversations,
  messages,
  matches,
  screenshots,
  normalizeExtractedProfile,
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

function profileSummary(match: {
  name: string;
  notes: string;
  vibeTags: string[];
  extractedProfile: ReturnType<typeof normalizeExtractedProfile>;
}): string {
  const p = match.extractedProfile;
  const s = p.scores;
  const fmt = (v: { value: number | null; rationale: string | null }) =>
    v.value == null ? "n/a" : `${v.value}/10${v.rationale ? ` — ${v.rationale}` : ""}`;
  return [
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
}

async function buildSystemPrompt(matchId: number | null): Promise<string> {
  const base = `You are the user's dating wingman. You have access to detailed profiles, conversation analyses, and scores for the women he's matched with. Speak candidly and tactically — he wants real strategic advice on attraction, replies, escalation, and reading her interest. Be direct, witty, and honest. Reference specific details from the profile and screenshots when relevant.`;

  if (matchId == null) {
    const all = await db.select().from(matches).orderBy(desc(matches.updatedAt));
    if (all.length === 0) {
      return `${base}\n\nThe user has no matches in his CRM yet.`;
    }
    const summaries = all
      .map((m, i) => {
        const norm = { ...m, extractedProfile: normalizeExtractedProfile(m.extractedProfile) };
        return `--- Match #${i + 1} (id=${m.id}) ---\n${profileSummary(norm)}`;
      })
      .join("\n\n");
    return `${base}\n\nHere is the full roster he's working with:\n\n${summaries}`;
  }

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) return base;
  const norm = { ...match, extractedProfile: normalizeExtractedProfile(match.extractedProfile) };
  return `${base}\n\nThis conversation is focused on ONE specific match. Her profile:\n\n${profileSummary(norm)}\n\nThe user's most recent screenshots of their chat will be attached to his next message so you can read the actual conversation.`;
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

  const systemPrompt = await buildSystemPrompt(conv.matchId);
  const images = conv.matchId != null ? await loadMatchImages(conv.matchId) : [];

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
