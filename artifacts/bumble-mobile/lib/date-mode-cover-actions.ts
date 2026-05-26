import type { CircleCheckStatus } from "./date-safety-plan";

export type CoverQuickActionId = "safe" | "call" | "pickup" | "text" | "home";

export type CoverQuickActionMessageIntent =
  | "safe"
  | "call"
  | "pickup"
  | "text"
  | "completed";

export type CoverQuickAction = {
  id: CoverQuickActionId;
  label: string;
  detail: string;
  icon: string;
  circleStatus: CircleCheckStatus;
  messageIntent: CoverQuickActionMessageIntent;
};

export const COVER_QUICK_ACTIONS: CoverQuickAction[] = [
  {
    id: "safe",
    label: "Check",
    detail: "Mark the check-in.",
    icon: "check-circle",
    circleStatus: "safe",
    messageIntent: "safe",
  },
  {
    id: "call",
    label: "Call",
    detail: "Ask for a call.",
    icon: "phone",
    circleStatus: "needs_help",
    messageIntent: "call",
  },
  {
    id: "pickup",
    label: "Ride",
    detail: "Ask for pickup.",
    icon: "navigation",
    circleStatus: "needs_help",
    messageIntent: "pickup",
  },
  {
    id: "text",
    label: "Text",
    detail: "Ask for a text.",
    icon: "message-circle",
    circleStatus: "needs_help",
    messageIntent: "text",
  },
  {
    id: "home",
    label: "Done",
    detail: "Close the timer.",
    icon: "home",
    circleStatus: "completed",
    messageIntent: "completed",
  },
];

export function getCoverQuickAction(
  id: CoverQuickActionId,
): CoverQuickAction | undefined {
  return COVER_QUICK_ACTIONS.find((action) => action.id === id);
}
