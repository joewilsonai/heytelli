import { circleLabelsFromPlanValue } from "./circle-card-labels.ts";
import type { DateSafetyPlanMatch } from "./date-safety-plan.ts";
import { getApiBaseUrl } from "./api-base.ts";
import { getAuthHeader, loadAuthSession } from "./auth-session.ts";

export type CreateDateCardRequest = {
  clientDateId: string;
  senderLabel: string;
  matchFirstName: string;
  venueLabel: string | null;
  venueArea: string | null;
  dateStartAt: string;
  dateEndAt: string;
  checkInAt: string | null;
  transportPlan: string | null;
  exitPlan: string | null;
  codeWordHint: string | null;
  senderNote: string | null;
  recipients: Array<{
    label: string;
    relationshipLabel: string | null;
    deliveryVia: "native_share";
  }>;
};

export type DateCardShareLink = {
  recipientLabel: string;
  relationshipLabel?: string | null;
  shareUrl: string;
};

export type PrivateDateCardRecipientStatus = {
  recipientLabel: string;
  relationshipLabel?: string | null;
  viewedAt: string | null;
  confirmedAt: string | null;
};

export type PrivateDateCard = {
  id: string;
  clientDateId: string | null;
  status: string;
  expiresAt: string;
  recipients: PrivateDateCardRecipientStatus[];
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed : null;
}

function firstName(value: string | null | undefined, fallback: string): string {
  const cleaned = clean(value) ?? fallback;
  return cleaned.split(/\s+/)[0] ?? fallback;
}

export function dateCardIsoSegment(value: string | null | undefined): string {
  if (!value) return "unset";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unset" : date.toISOString();
}

function splitVenue(value: string | null | undefined): {
  venueLabel: string | null;
  venueArea: string | null;
} {
  const cleaned = clean(value);
  if (!cleaned) return { venueLabel: null, venueArea: null };
  const [label, ...areaParts] = cleaned.split(/\s+-\s+/);
  return {
    venueLabel: clean(label) ?? cleaned,
    venueArea: clean(areaParts.join(" - ")),
  };
}

function senderLabelFromInput(value?: string | null): string {
  if (clean(value)) return firstName(value, "Your friend");
  return "Your friend";
}

export function buildCreateDateCardRequest(input: {
  senderLabel?: string | null;
  match: DateSafetyPlanMatch & {
    id?: number;
    dateSafetyPlan?: DateSafetyPlanMatch["dateSafetyPlan"] | null;
  };
}): CreateDateCardRequest {
  const plan = input.match.dateSafetyPlan;
  const { venueLabel, venueArea } = splitVenue(input.match.nextDateLocation);
  const recipients = circleLabelsFromPlanValue(plan?.trustedCircleName).map(
    (label) => ({
      label,
      relationshipLabel: null,
      deliveryVia: "native_share" as const,
    }),
  );

  return {
    clientDateId: [
      "date",
      dateCardIsoSegment(input.match.nextDateAt),
      dateCardIsoSegment(plan?.checkInAt),
      dateCardIsoSegment(plan?.expectedEndAt),
    ].join(":"),
    senderLabel: senderLabelFromInput(input.senderLabel),
    matchFirstName: firstName(input.match.name, "my date"),
    venueLabel,
    venueArea,
    dateStartAt: dateCardIsoSegment(input.match.nextDateAt),
    dateEndAt: dateCardIsoSegment(plan?.expectedEndAt),
    checkInAt:
      dateCardIsoSegment(plan?.checkInAt) === "unset"
        ? null
        : dateCardIsoSegment(plan?.checkInAt),
    transportPlan: clean(plan?.transportPlan),
    exitPlan: clean(plan?.circleNote),
    codeWordHint: clean(plan?.codeWord),
    senderNote: clean(plan?.circleNote),
    recipients,
  };
}

export function buildDateCardClientDateId(match: DateSafetyPlanMatch): string {
  const plan = match.dateSafetyPlan;
  return [
    "date",
    dateCardIsoSegment(match.nextDateAt),
    dateCardIsoSegment(plan?.checkInAt),
    dateCardIsoSegment(plan?.expectedEndAt),
  ].join(":");
}

export function appendDateCardLinksToMessage(
  message: string,
  links: DateCardShareLink[],
): string {
  if (links.length === 0) return message;
  const lines = links.map((link) => `${link.recipientLabel}: ${link.shareUrl}`);
  return `${message}\n\nPrivate links:\n${lines.join("\n")}`;
}

export async function createPrivateDateCardLinks(input: {
  senderLabel?: string | null;
  match: DateSafetyPlanMatch;
}): Promise<DateCardShareLink[]> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) throw new Error("API connection is not configured.");
  const session = await loadAuthSession();
  const response = await fetch(`${apiBaseUrl}/api/date-cards`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getAuthHeader()),
    },
    body: JSON.stringify(
      buildCreateDateCardRequest({
        senderLabel: input.senderLabel ?? session?.user.displayName,
        match: input.match,
      }),
    ),
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: unknown;
    recipients?: unknown;
  };
  if (!response.ok) {
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : "Could not create private Date Card links.",
    );
  }
  const recipients: unknown[] = Array.isArray(body.recipients)
    ? body.recipients
    : [];
  return recipients
    .map((recipient): DateCardShareLink => {
      const value =
        recipient && typeof recipient === "object"
          ? (recipient as Record<string, unknown>)
          : {};
      return {
        recipientLabel:
          typeof value.recipientLabel === "string" ? value.recipientLabel : "",
        relationshipLabel:
          typeof value.relationshipLabel === "string"
            ? value.relationshipLabel
            : null,
        shareUrl: typeof value.shareUrl === "string" ? value.shareUrl : "",
      };
    })
    .filter((recipient): recipient is DateCardShareLink =>
      Boolean(recipient.recipientLabel && recipient.shareUrl),
    );
}

function cleanPrivateDateCard(value: unknown): PrivateDateCard | null {
  if (!value || typeof value !== "object") return null;
  const card = value as Record<string, unknown>;
  const recipients = Array.isArray(card.recipients) ? card.recipients : [];
  if (typeof card.id !== "string" || typeof card.status !== "string") {
    return null;
  }
  return {
    id: card.id,
    clientDateId:
      typeof card.clientDateId === "string" ? card.clientDateId : null,
    status: card.status,
    expiresAt: typeof card.expiresAt === "string" ? card.expiresAt : "",
    recipients: recipients
      .map((recipient): PrivateDateCardRecipientStatus | null => {
        const item =
          recipient && typeof recipient === "object"
            ? (recipient as Record<string, unknown>)
            : {};
        if (typeof item.recipientLabel !== "string") return null;
        return {
          recipientLabel: item.recipientLabel,
          relationshipLabel:
            typeof item.relationshipLabel === "string"
              ? item.relationshipLabel
              : null,
          viewedAt: typeof item.viewedAt === "string" ? item.viewedAt : null,
          confirmedAt:
            typeof item.confirmedAt === "string" ? item.confirmedAt : null,
        };
      })
      .filter(
        (recipient): recipient is PrivateDateCardRecipientStatus =>
          recipient != null,
      ),
  };
}

export async function listPrivateDateCards(): Promise<PrivateDateCard[]> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) throw new Error("API connection is not configured.");
  const response = await fetch(`${apiBaseUrl}/api/date-cards`, {
    headers: await getAuthHeader(),
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: unknown;
    cards?: unknown;
  };
  if (!response.ok) {
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : "Could not load Date Cards.",
    );
  }
  const cards = Array.isArray(body.cards) ? body.cards : [];
  return cards
    .map(cleanPrivateDateCard)
    .filter((card): card is PrivateDateCard => card != null);
}

export function findPrivateDateCardForMatch(
  cards: PrivateDateCard[],
  match: DateSafetyPlanMatch,
): PrivateDateCard | null {
  const clientDateId = buildDateCardClientDateId(match);
  return cards.find((card) => card.clientDateId === clientDateId) ?? null;
}

export function summarizePrivateDateCardStatus(card: PrivateDateCard): string {
  const confirmed = card.recipients.filter(
    (recipient) => recipient.confirmedAt,
  ).length;
  const viewed = card.recipients.filter(
    (recipient) => recipient.viewedAt,
  ).length;
  if (confirmed > 0) return `${confirmed}/${card.recipients.length} confirmed`;
  if (viewed > 0) return `${viewed}/${card.recipients.length} viewed`;
  return card.status === "sent" ? "Sent, waiting for views" : card.status;
}
