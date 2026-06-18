import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  createImprovementSignal,
  listMyImprovementSignals,
  type ImprovementFeedbackType,
  type UserFeedbackStatus,
} from "@workspace/api-client-react";

export type FeedbackType = ImprovementFeedbackType;

export const feedbackTypes: FeedbackType[] = [
  "Bug",
  "Confusing",
  "Idea",
  "Safety concern",
  "Love this",
];

export type SubmitImprovementFeedbackInput = {
  type: FeedbackType;
  message: string;
  surface: string;
  matchId?: number | null;
  technicalContextConsent: boolean;
  context?: Record<string, string | number | boolean | null | undefined>;
};

export const feedbackFollowUpStages = [
  "received",
  "accepted",
  "planned",
  "shipped",
  "not_planned",
] as const;

export function buildFeedbackReceiptMessage(signalId?: number | null): string {
  const ticket = signalId
    ? `Feedback #${signalId} is saved.`
    : "Feedback is saved.";
  return `${ticket} If we accept it, Settings build notes will call out whether it is planned, shipping soon, already shipped, or not planned right now.`;
}

export function buildFeedbackTechnicalContext(
  surface: string,
  context: SubmitImprovementFeedbackInput["context"] = {},
): Record<string, unknown> {
  const appVersion = Constants.expoConfig?.version;
  const buildNumber = Constants.nativeBuildVersion ?? undefined;
  return {
    platform: Platform.OS,
    appVersion,
    buildNumber,
    route: surface,
    ...context,
  };
}

export async function submitImprovementFeedback({
  type,
  message,
  surface,
  matchId = null,
  technicalContextConsent,
  context,
}: SubmitImprovementFeedbackInput) {
  const clientContext = technicalContextConsent
    ? buildFeedbackTechnicalContext(surface, context)
    : {};
  return createImprovementSignal({
    source: "in_app_feedback",
    type,
    message: message.trim(),
    matchId,
    surface,
    technicalContextConsent,
    clientContext: Object.keys(clientContext).length
      ? clientContext
      : undefined,
  });
}

export type FeedbackStatus = UserFeedbackStatus;

export async function listMyImprovementFeedbackStatuses() {
  return listMyImprovementSignals();
}
