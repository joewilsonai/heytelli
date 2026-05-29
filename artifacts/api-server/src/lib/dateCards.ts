import { createHash, randomBytes } from "node:crypto";
import type {
  DateCardDeliveryVia,
  DateCardStatus,
  InsertDateCard,
  InsertDateCardEvent,
  InsertDateCardRecipient,
} from "@workspace/db";

type RecipientInput = {
  label?: unknown;
  relationshipLabel?: unknown;
  deliveryVia?: unknown;
};

export type DateCardCreationInput = {
  clientDateId?: unknown;
  senderLabel?: unknown;
  matchFirstName?: unknown;
  venueLabel?: unknown;
  venueArea?: unknown;
  dateStartAt?: unknown;
  dateEndAt?: unknown;
  checkInAt?: unknown;
  transportPlan?: unknown;
  exitPlan?: unknown;
  codeWordHint?: unknown;
  senderNote?: unknown;
  recipients?: unknown;
};

type BuildOptions = {
  userId: number;
  now?: Date;
  shareBaseUrl: string;
  tokenGenerator?: () => string;
};

export type DateCardCreationPlan =
  | {
      ok: true;
      card: InsertDateCard;
      recipients: Array<{
        row: Omit<InsertDateCardRecipient, "cardId">;
        shareToken: string;
        shareUrl: string;
      }>;
      event: Omit<InsertDateCardEvent, "cardId">;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

type RenderCard = {
  senderLabel: string;
  matchFirstName: string | null;
  venueLabel: string | null;
  venueArea: string | null;
  dateStartAt: Date;
  dateEndAt: Date;
  checkInAt: Date | null;
  transportPlan: string | null;
  exitPlan: string | null;
  codeWordHint: string | null;
  senderNote: string | null;
  status: DateCardStatus;
};

type RenderRecipient = {
  recipientLabel: string;
  relationshipLabel: string | null;
  viewedAt: Date | null;
  confirmedAt: Date | null;
};

export type DateCardRenderInput = {
  card: RenderCard;
  recipient: RenderRecipient;
  shareToken?: string;
  now?: Date;
};

const MAX_RECIPIENTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function cleanText(
  value: unknown,
  fallback: string | null = null,
): string | null {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed || fallback;
}

function cleanLongText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/[ \t]+/g, " ");
  return trimmed || null;
}

function firstName(value: unknown, fallback: string): string {
  const cleaned = cleanText(value, fallback) ?? fallback;
  return cleaned.split(/\s+/)[0] ?? fallback;
}

function cleanDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanDeliveryVia(value: unknown): DateCardDeliveryVia {
  return value === "sms" ||
    value === "imessage" ||
    value === "native_share" ||
    value === "other"
    ? value
    : "native_share";
}

function cleanRecipients(value: unknown): Array<{
  recipientLabel: string;
  relationshipLabel: string | null;
  deliveryVia: DateCardDeliveryVia;
}> {
  const input = Array.isArray(value) ? value : [];
  return input
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const recipient = raw as RecipientInput;
      const label = firstName(recipient.label, "");
      if (!label) return null;
      return {
        recipientLabel: label,
        relationshipLabel: cleanText(recipient.relationshipLabel),
        deliveryVia: cleanDeliveryVia(recipient.deliveryVia),
      };
    })
    .filter(
      (
        recipient,
      ): recipient is {
        recipientLabel: string;
        relationshipLabel: string | null;
        deliveryVia: DateCardDeliveryVia;
      } => recipient != null,
    )
    .slice(0, MAX_RECIPIENTS);
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function buildDateCardCreationPlan(
  input: DateCardCreationInput,
  options: BuildOptions,
): DateCardCreationPlan {
  const dateStartAt = cleanDate(input.dateStartAt);
  const dateEndAt = cleanDate(input.dateEndAt);
  const checkInAt = cleanDate(input.checkInAt);

  if (!dateStartAt) {
    return { ok: false, status: 400, error: "Date start time is required." };
  }
  if (!dateEndAt || dateEndAt.getTime() <= dateStartAt.getTime()) {
    return {
      ok: false,
      status: 400,
      error: "Expected end time must be after the date start.",
    };
  }

  const recipients = cleanRecipients(input.recipients);
  if (recipients.length === 0) {
    return { ok: false, status: 400, error: "Add at least one circle person." };
  }

  const expiresAt = new Date(dateEndAt.getTime() + DAY_MS);
  const tokenGenerator = options.tokenGenerator ?? generateShareToken;
  const shareBaseUrl = normalizeBaseUrl(options.shareBaseUrl);

  return {
    ok: true,
    card: {
      userId: options.userId,
      clientDateId: cleanText(input.clientDateId),
      status: "sent",
      senderLabel: firstName(input.senderLabel, "Your friend"),
      matchFirstName: firstName(input.matchFirstName, "my date"),
      venueLabel: cleanText(input.venueLabel),
      venueArea: cleanText(input.venueArea),
      dateStartAt,
      dateEndAt,
      checkInAt,
      expiresAt,
      transportPlan: cleanText(input.transportPlan),
      exitPlan: cleanText(input.exitPlan),
      codeWordHint: cleanText(input.codeWordHint),
      senderNote: cleanLongText(input.senderNote),
      revokedAt: null,
      completedAt: null,
      updatedAt: options.now ?? new Date(),
    },
    recipients: recipients.map((recipient) => {
      const shareToken = tokenGenerator();
      return {
        row: {
          recipientLabel: recipient.recipientLabel,
          relationshipLabel: recipient.relationshipLabel,
          shareTokenHash: hashShareToken(shareToken),
          deliveryVia: recipient.deliveryVia,
          viewedAt: null,
          confirmedAt: null,
          mutedAt: null,
          remindersOptin: false,
          remindersContact: null,
        },
        shareToken,
        shareUrl: `${shareBaseUrl}/c/${shareToken}`,
      };
    }),
    event: {
      recipientId: null,
      eventType: "created",
      idempotencyKey: `created:${cleanText(input.clientDateId) ?? dateStartAt.toISOString()}`,
      metadata: {
        recipientCount: recipients.length,
        hasCheckIn: checkInAt != null,
      },
    },
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value: Date | null): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function field(label: string, value: string | null): string {
  if (!value) return "";
  return `<div class="row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(
    value,
  )}</strong></div>`;
}

export function renderDateCardHtml(input: DateCardRenderInput): string {
  const { card, recipient } = input;
  const confirmPath = input.shareToken
    ? `/api/date-card-shares/${encodeURIComponent(input.shareToken)}/confirm`
    : null;
  const statusLabel =
    card.status === "completed"
      ? "Home safe"
      : card.status === "revoked"
        ? "Revoked"
        : card.status === "expired"
          ? "Expired"
          : recipient.confirmedAt
            ? "Confirmed"
            : recipient.viewedAt
              ? "Viewed"
              : "Sent";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HeyTelli Date Card</title>
  <style>
    :root { color-scheme: light; --cream:#FAF7F3; --ink:#2E2632; --muted:#756E78; --line:#E7E0D8; --accent:#E07A5F; --ok:#3F7D5B; }
    body { margin:0; background:var(--cream); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif; }
    main { max-width:680px; margin:0 auto; padding:28px 18px 40px; }
    .brand { font-weight:800; letter-spacing:.02em; color:var(--accent); margin-bottom:28px; }
    h1 { font-family:Georgia,"Times New Roman",serif; font-size:34px; line-height:1.08; margin:0 0 10px; }
    .sub { color:var(--muted); font-size:16px; margin:0 0 22px; }
    .card { background:#fff; border:1px solid var(--line); border-radius:16px; padding:22px; box-shadow:0 12px 34px rgba(46,38,50,.08); }
    .pill { display:inline-flex; align-items:center; border:1px solid var(--line); border-radius:999px; padding:6px 10px; color:var(--ok); font-size:13px; font-weight:700; margin-bottom:18px; }
    .row { border-top:1px solid var(--line); padding:14px 0; display:grid; gap:6px; }
    .row span { color:var(--muted); font-size:13px; font-weight:700; text-transform:uppercase; }
    .row strong { font-size:17px; line-height:1.35; }
    .note { margin-top:18px; padding:16px; border-radius:12px; background:#FFF7F2; border:1px solid #F1C9BA; line-height:1.55; }
    .actions { display:grid; gap:10px; margin-top:18px; }
    button, a.button { border:0; border-radius:12px; background:var(--accent); color:white; font-weight:800; padding:14px 16px; text-align:center; text-decoration:none; font-size:16px; }
    footer { color:var(--muted); font-size:13px; margin-top:24px; line-height:1.5; }
  </style>
</head>
<body>
  <main>
    <div class="brand">HeyTelli</div>
    <h1>${escapeHtml(card.senderLabel)} shared a Date Card with you</h1>
    <p class="sub">For ${escapeHtml(recipient.recipientLabel)}${recipient.relationshipLabel ? ` (${escapeHtml(recipient.relationshipLabel)})` : ""}</p>
    <section class="card">
      <div class="pill">${escapeHtml(statusLabel)}</div>
      <h2>Date with ${escapeHtml(card.matchFirstName ?? "my date")}</h2>
      ${field("When", formatDate(card.dateStartAt))}
      ${field("Expected end", formatDate(card.dateEndAt))}
      ${field("Check-in", formatDate(card.checkInAt))}
      ${field("Place", [card.venueLabel, card.venueArea].filter(Boolean).join(" - ") || null)}
      ${field("Transport", card.transportPlan)}
      ${field("If check-in is missed", card.exitPlan)}
      ${field("Code word", card.codeWordHint)}
      ${card.senderNote ? `<div class="note">${escapeHtml(card.senderNote)}</div>` : ""}
      <div class="actions">
        <button id="confirm" type="button">Got it</button>
      </div>
    </section>
    <footer>This private status page expires automatically after the date window. It only contains the safety details your friend chose to share.</footer>
  </main>
  ${
    confirmPath
      ? `<script>
    const button = document.getElementById("confirm");
    button?.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const response = await fetch("${escapeHtml(confirmPath)}", { method: "POST" });
        button.textContent = response.ok ? "Confirmed" : "Try again";
        button.disabled = response.ok;
      } catch {
        button.textContent = "Try again";
        button.disabled = false;
      }
    });
  </script>`
      : ""
  }
</body>
</html>`;
}

export function isDateCardExpired(
  card: { expiresAt: Date; revokedAt?: Date | null },
  now = new Date(),
): boolean {
  return Boolean(card.revokedAt) || card.expiresAt.getTime() <= now.getTime();
}
