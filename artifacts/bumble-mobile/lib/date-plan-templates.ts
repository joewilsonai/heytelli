import type { SafeDateChecklist } from "./date-safety-plan.ts";

export type DatePlanTemplate = {
  id: "coffee" | "dinner" | "activity";
  label: string;
  detail: string;
  transportPlan: string;
  checkInOffsetMinutes: number;
  expectedEndOffsetMinutes: number;
  circleNote: string;
  safeDateChecklist: SafeDateChecklist;
};

const sharedChecklist: SafeDateChecklist = {
  publicPlace: true,
  ownTransport: true,
  circleHasPlan: false,
  profileReviewed: true,
  noPrivateLocationPressure: true,
  noMoneyOrPhotoPressure: true,
};

export const DATE_PLAN_TEMPLATES: DatePlanTemplate[] = [
  {
    id: "coffee",
    label: "Coffee",
    detail: "Short public first meet",
    transportPlan: "I have my own ride and a clear end time.",
    checkInOffsetMinutes: 45,
    expectedEndOffsetMinutes: 120,
    circleNote: "Text me if I miss the check-in.",
    safeDateChecklist: sharedChecklist,
  },
  {
    id: "dinner",
    label: "Dinner",
    detail: "Longer evening plan",
    transportPlan: "I will arrive and leave on my own.",
    checkInOffsetMinutes: 60,
    expectedEndOffsetMinutes: 180,
    circleNote: "If I do not respond after the expected end, check on me.",
    safeDateChecklist: sharedChecklist,
  },
  {
    id: "activity",
    label: "Activity",
    detail: "Event, walk, market, or show",
    transportPlan: "I am keeping my exit independent.",
    checkInOffsetMinutes: 60,
    expectedEndOffsetMinutes: 240,
    circleNote: "I will send an update if the plan changes locations.",
    safeDateChecklist: sharedChecklist,
  },
];

function minutesAfter(value: string | null | undefined, minutes: number) {
  const start = value ? new Date(value) : new Date();
  if (Number.isNaN(start.getTime())) return null;
  const date = new Date(start);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

export function buildDatePlanFromTemplate(
  template: DatePlanTemplate,
  nextDateAt: string | null | undefined,
): {
  transportPlan: string;
  checkInAt: string | null;
  expectedEndAt: string | null;
  circleNote: string;
  safeDateChecklist: SafeDateChecklist;
} {
  return {
    transportPlan: template.transportPlan,
    checkInAt: minutesAfter(nextDateAt, template.checkInOffsetMinutes),
    expectedEndAt: minutesAfter(nextDateAt, template.expectedEndOffsetMinutes),
    circleNote: template.circleNote,
    safeDateChecklist: { ...template.safeDateChecklist },
  };
}
