import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  dateCardEvents,
  dateCardRecipients,
  dateCards,
  type DateCard,
  type DateCardRecipient,
  type DateCardStatus,
} from "@workspace/db";
import { requireAuth, requireUserId } from "../lib/auth";
import {
  buildDateCardCreationPlan,
  hashShareToken,
  isDateCardExpired,
  renderDateCardHtml,
} from "../lib/dateCards";

const router: IRouter = Router();
export const dateCardPublicRouter: IRouter = Router();

type LoadedShare = {
  card: DateCard;
  recipient: DateCardRecipient;
};

function requestBaseUrl(req: Request): string {
  const configured =
    process.env.HEYTELLI_DATE_CARD_BASE_URL ??
    process.env.HEYTELLI_PUBLIC_BASE_URL ??
    process.env.PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const proto = String(req.get("x-forwarded-proto") ?? req.protocol ?? "https")
    .split(",")[0]
    ?.trim();
  return `${proto || "https"}://${req.get("host")}`;
}

function paramValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function serializeCard(card: DateCard) {
  return {
    id: card.id,
    clientDateId: card.clientDateId,
    status: card.status,
    senderLabel: card.senderLabel,
    matchFirstName: card.matchFirstName,
    venueLabel: card.venueLabel,
    venueArea: card.venueArea,
    dateStartAt: card.dateStartAt.toISOString(),
    dateEndAt: card.dateEndAt.toISOString(),
    checkInAt: card.checkInAt?.toISOString() ?? null,
    expiresAt: card.expiresAt.toISOString(),
    transportPlan: card.transportPlan,
    exitPlan: card.exitPlan,
    codeWordHint: card.codeWordHint,
    senderNote: card.senderNote,
    revokedAt: card.revokedAt?.toISOString() ?? null,
    completedAt: card.completedAt?.toISOString() ?? null,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

function serializeRecipient(recipient: DateCardRecipient, shareUrl?: string) {
  return {
    id: recipient.id,
    recipientLabel: recipient.recipientLabel,
    relationshipLabel: recipient.relationshipLabel,
    deliveryVia: recipient.deliveryVia,
    viewedAt: recipient.viewedAt?.toISOString() ?? null,
    confirmedAt: recipient.confirmedAt?.toISOString() ?? null,
    mutedAt: recipient.mutedAt?.toISOString() ?? null,
    shareUrl,
  };
}

async function loadShare(shareToken: string): Promise<LoadedShare | null> {
  const [recipient] = await db
    .select()
    .from(dateCardRecipients)
    .where(eq(dateCardRecipients.shareTokenHash, hashShareToken(shareToken)));
  if (!recipient) return null;
  const [card] = await db
    .select()
    .from(dateCards)
    .where(eq(dateCards.id, recipient.cardId));
  return card ? { card, recipient } : null;
}

async function recordEvent(input: {
  cardId: string;
  recipientId?: string | null;
  eventType:
    | "viewed"
    | "confirmed"
    | "muted"
    | "revoked"
    | "completed"
    | "expired";
  metadata?: Record<string, unknown>;
}) {
  await db
    .insert(dateCardEvents)
    .values({
      cardId: input.cardId,
      recipientId: input.recipientId ?? null,
      eventType: input.eventType,
      idempotencyKey: `${input.eventType}:${input.recipientId ?? "card"}`,
      metadata: input.metadata ?? {},
    })
    .onConflictDoNothing();
}

async function markShareViewed(loaded: LoadedShare, now = new Date()) {
  if (!loaded.recipient.viewedAt) {
    await db
      .update(dateCardRecipients)
      .set({ viewedAt: now })
      .where(eq(dateCardRecipients.id, loaded.recipient.id));
    loaded.recipient.viewedAt = now;
  }
  if (loaded.card.status === "sent") {
    await db
      .update(dateCards)
      .set({ status: "viewed", updatedAt: now })
      .where(eq(dateCards.id, loaded.card.id));
    loaded.card.status = "viewed";
    loaded.card.updatedAt = now;
  }
  await recordEvent({
    cardId: loaded.card.id,
    recipientId: loaded.recipient.id,
    eventType: "viewed",
  });
}

async function expireCard(card: DateCard, now = new Date()) {
  if (card.status !== "expired" && !card.revokedAt) {
    await db
      .update(dateCards)
      .set({ status: "expired", updatedAt: now })
      .where(eq(dateCards.id, card.id));
    await recordEvent({ cardId: card.id, eventType: "expired" });
  }
}

function isUnavailable(card: DateCard, now = new Date()): boolean {
  return card.revokedAt != null || isDateCardExpired(card, now);
}

router.post("/date-cards", requireAuth, async (req, res): Promise<void> => {
  const userId = requireUserId(req);
  const plan = buildDateCardCreationPlan(req.body, {
    userId,
    shareBaseUrl: requestBaseUrl(req),
  });
  if (!plan.ok) {
    res.status(plan.status).json({ error: plan.error });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [card] = await tx.insert(dateCards).values(plan.card).returning();
      if (!card) throw new Error("Date Card insert failed");
      const insertedRecipients = await tx
        .insert(dateCardRecipients)
        .values(
          plan.recipients.map((recipient) => ({
            ...recipient.row,
            cardId: card.id,
          })),
        )
        .returning();
      await tx
        .insert(dateCardEvents)
        .values({ ...plan.event, cardId: card.id });
      return { card, recipients: insertedRecipients };
    });

    res.status(201).json({
      card: serializeCard(result.card),
      recipients: result.recipients.map((recipient, index) =>
        serializeRecipient(recipient, plan.recipients[index]?.shareUrl),
      ),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create Date Card");
    res.status(500).json({ error: "Failed to create Date Card." });
  }
});

router.get("/date-cards", requireAuth, async (req, res): Promise<void> => {
  const userId = requireUserId(req);
  const rows = await db
    .select()
    .from(dateCards)
    .where(eq(dateCards.userId, userId))
    .orderBy(desc(dateCards.createdAt));
  const cardIds = rows.map((card) => card.id);
  const recipientRows =
    cardIds.length > 0
      ? await db
          .select()
          .from(dateCardRecipients)
          .where(inArray(dateCardRecipients.cardId, cardIds))
      : [];
  res.json({
    cards: rows.map((card) => ({
      ...serializeCard(card),
      recipients: recipientRows
        .filter((recipient) => recipient.cardId === card.id)
        .map((recipient) => serializeRecipient(recipient)),
    })),
  });
});

router.get("/date-cards/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = requireUserId(req);
  const cardId = paramValue(req.params.id);
  const [card] = await db
    .select()
    .from(dateCards)
    .where(and(eq(dateCards.id, cardId), eq(dateCards.userId, userId)));
  if (!card) {
    res.status(404).json({ error: "Date Card not found." });
    return;
  }
  const recipients = await db
    .select()
    .from(dateCardRecipients)
    .where(eq(dateCardRecipients.cardId, card.id));
  const events = await db
    .select()
    .from(dateCardEvents)
    .where(eq(dateCardEvents.cardId, card.id))
    .orderBy(desc(dateCardEvents.createdAt));
  res.json({
    card: serializeCard(card),
    recipients: recipients.map((recipient) => serializeRecipient(recipient)),
    events,
  });
});

router.post(
  "/date-cards/:id/revoke",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = requireUserId(req);
    const cardId = paramValue(req.params.id);
    const now = new Date();
    const [card] = await db
      .update(dateCards)
      .set({ status: "revoked", revokedAt: now, updatedAt: now })
      .where(and(eq(dateCards.id, cardId), eq(dateCards.userId, userId)))
      .returning();
    if (!card) {
      res.status(404).json({ error: "Date Card not found." });
      return;
    }
    await recordEvent({ cardId: card.id, eventType: "revoked" });
    res.json({ card: serializeCard(card) });
  },
);

router.post(
  "/date-cards/:id/complete",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = requireUserId(req);
    const cardId = paramValue(req.params.id);
    const now = new Date();
    const [card] = await db
      .update(dateCards)
      .set({ status: "completed", completedAt: now, updatedAt: now })
      .where(and(eq(dateCards.id, cardId), eq(dateCards.userId, userId)))
      .returning();
    if (!card) {
      res.status(404).json({ error: "Date Card not found." });
      return;
    }
    await recordEvent({ cardId: card.id, eventType: "completed" });
    res.json({ card: serializeCard(card) });
  },
);

router.post(
  "/date-card-shares/:shareToken/view",
  async (req, res): Promise<void> => {
    const loaded = await loadShare(req.params.shareToken);
    if (!loaded) {
      res.status(404).json({ error: "Date Card not found." });
      return;
    }
    if (isUnavailable(loaded.card)) {
      await expireCard(loaded.card);
      res.status(410).json({ error: "Date Card is no longer available." });
      return;
    }
    await markShareViewed(loaded);
    res.json({ ok: true });
  },
);

router.post(
  "/date-card-shares/:shareToken/confirm",
  async (req, res): Promise<void> => {
    const loaded = await loadShare(req.params.shareToken);
    if (!loaded) {
      res.status(404).json({ error: "Date Card not found." });
      return;
    }
    if (isUnavailable(loaded.card)) {
      await expireCard(loaded.card);
      res.status(410).json({ error: "Date Card is no longer available." });
      return;
    }
    const now = new Date();
    await markShareViewed(loaded, now);
    await db
      .update(dateCardRecipients)
      .set({ confirmedAt: now })
      .where(eq(dateCardRecipients.id, loaded.recipient.id));
    const nextStatus: DateCardStatus =
      loaded.card.status === "completed" ? "completed" : "confirmed";
    await db
      .update(dateCards)
      .set({ status: nextStatus, updatedAt: now })
      .where(eq(dateCards.id, loaded.card.id));
    await recordEvent({
      cardId: loaded.card.id,
      recipientId: loaded.recipient.id,
      eventType: "confirmed",
    });
    res.json({ ok: true });
  },
);

router.post(
  "/date-card-shares/:shareToken/mute",
  async (req, res): Promise<void> => {
    const loaded = await loadShare(req.params.shareToken);
    if (!loaded) {
      res.status(404).json({ error: "Date Card not found." });
      return;
    }
    const now = new Date();
    await db
      .update(dateCardRecipients)
      .set({ mutedAt: now })
      .where(eq(dateCardRecipients.id, loaded.recipient.id));
    await recordEvent({
      cardId: loaded.card.id,
      recipientId: loaded.recipient.id,
      eventType: "muted",
    });
    res.json({ ok: true });
  },
);

dateCardPublicRouter.get("/c/:shareToken", async (req, res): Promise<void> => {
  const loaded = await loadShare(req.params.shareToken);
  if (!loaded) {
    res.status(404).type("text").send("Date Card not found.");
    return;
  }
  if (isUnavailable(loaded.card)) {
    await expireCard(loaded.card);
    res.status(410).type("text").send("Date Card is no longer available.");
    return;
  }
  await markShareViewed(loaded);
  res.type("html").send(
    renderDateCardHtml({
      card: loaded.card,
      recipient: loaded.recipient,
      shareToken: paramValue(req.params.shareToken),
    }),
  );
});

export default router;
