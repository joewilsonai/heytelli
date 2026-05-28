import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  createImprovementSignal,
  type ImprovementFeedbackType,
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
  return createImprovementSignal({
    source: "in_app_feedback",
    type,
    message: message.trim(),
    matchId,
    surface,
    technicalContextConsent,
    clientContext: technicalContextConsent
      ? buildFeedbackTechnicalContext(surface, context)
      : undefined,
  });
}
