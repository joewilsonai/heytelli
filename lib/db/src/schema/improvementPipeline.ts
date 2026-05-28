import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

import { matches } from "./matches";
import { users } from "./users";

export type ImprovementSignalSource =
  | "in_app_feedback"
  | "client_error"
  | "api_error"
  | "analysis_failure"
  | "auth_failure"
  | "share_failure"
  | "analytics"
  | "crash"
  | "system_monitor";
export type ImprovementSeverity =
  | "info"
  | "low"
  | "medium"
  | "high"
  | "critical";
export type ImprovementPrivacyRisk = "low" | "medium" | "high" | "blocked";
export type ImprovementSignalStatus =
  | "new"
  | "triaged"
  | "grouped"
  | "actionable"
  | "waiting_for_signal"
  | "blocked"
  | "resolved"
  | "ignored";
export type ImprovementCategory =
  | "bug"
  | "ux_confusion"
  | "feature_request"
  | "safety_issue"
  | "performance"
  | "reliability"
  | "privacy"
  | "copy"
  | "docs"
  | "test";
export type ImprovementPriority = "p0" | "p1" | "p2" | "p3";
export type ImprovementRiskTier =
  | "safe_auto_merge"
  | "guarded_auto_merge"
  | "extra_agent_review"
  | "no_auto_merge";
export type ImprovementWorkItemStatus =
  | "draft"
  | "issue_created"
  | "researching"
  | "planned"
  | "building"
  | "reviewing"
  | "changes_requested"
  | "checks_running"
  | "merged"
  | "deployed"
  | "monitoring"
  | "rolled_back"
  | "closed";
export type ImprovementRunType =
  | "triage"
  | "research"
  | "implementation"
  | "review"
  | "merge"
  | "deploy"
  | "monitor"
  | "rollback";
export type ImprovementRunStatus =
  | "started"
  | "succeeded"
  | "failed"
  | "blocked";

export const improvementSignals = pgTable("improvement_signals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  matchId: integer("match_id").references(() => matches.id, {
    onDelete: "set null",
  }),
  source: text("source").$type<ImprovementSignalSource>().notNull(),
  severity: text("severity").$type<ImprovementSeverity>().notNull().default("low"),
  rawPayload: jsonb("raw_payload")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  sanitizedSummary: text("sanitized_summary"),
  sanitizedPayload: jsonb("sanitized_payload").$type<Record<string, unknown>>(),
  privacyRisk: text("privacy_risk")
    .$type<ImprovementPrivacyRisk>()
    .notNull()
    .default("low"),
  fingerprint: text("fingerprint").notNull(),
  status: text("status").$type<ImprovementSignalStatus>().notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const improvementWorkItems = pgTable("improvement_work_items", {
  id: serial("id").primaryKey(),
  fingerprint: text("fingerprint").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  category: text("category").$type<ImprovementCategory>().notNull(),
  priority: text("priority").$type<ImprovementPriority>().notNull().default("p3"),
  riskTier: text("risk_tier")
    .$type<ImprovementRiskTier>()
    .notNull()
    .default("safe_auto_merge"),
  impactScore: integer("impact_score").notNull().default(1),
  confidenceScore: integer("confidence_score").notNull().default(1),
  frequencyCount: integer("frequency_count").notNull().default(1),
  signalIds: jsonb("signal_ids").$type<number[]>().notNull().default([]),
  githubIssueUrl: text("github_issue_url"),
  githubIssueNumber: integer("github_issue_number"),
  branchName: text("branch_name"),
  pullRequestUrl: text("pull_request_url"),
  pullRequestNumber: integer("pull_request_number"),
  status: text("status")
    .$type<ImprovementWorkItemStatus>()
    .notNull()
    .default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const improvementRuns = pgTable("improvement_runs", {
  id: serial("id").primaryKey(),
  workItemId: integer("work_item_id")
    .notNull()
    .references(() => improvementWorkItems.id, { onDelete: "cascade" }),
  runType: text("run_type").$type<ImprovementRunType>().notNull(),
  agentName: text("agent_name").notNull(),
  status: text("status").$type<ImprovementRunStatus>().notNull(),
  summary: text("summary").notNull(),
  logsUrl: text("logs_url"),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertImprovementSignalSchema = createInsertSchema(
  improvementSignals,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertImprovementWorkItemSchema = createInsertSchema(
  improvementWorkItems,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertImprovementRunSchema = createInsertSchema(
  improvementRuns,
).omit({
  id: true,
  createdAt: true,
});

export type ImprovementSignal = typeof improvementSignals.$inferSelect;
export type InsertImprovementSignal = typeof improvementSignals.$inferInsert;
export type ImprovementWorkItem = typeof improvementWorkItems.$inferSelect;
export type InsertImprovementWorkItem =
  typeof improvementWorkItems.$inferInsert;
export type ImprovementRun = typeof improvementRuns.$inferSelect;
export type InsertImprovementRun = typeof improvementRuns.$inferInsert;
