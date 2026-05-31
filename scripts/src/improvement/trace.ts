import { randomUUID } from "node:crypto";
import type {
  ImprovementTraceSpanKind,
  ImprovementTraceSpanStatus,
} from "@workspace/db";

export type TraceSpanInput = {
  traceId: string;
  workItemId: number | null;
  runId: number | null;
  name: string;
  kind: ImprovementTraceSpanKind;
  agentName: string | null;
  status: ImprovementTraceSpanStatus;
  startedAt: Date;
  endedAt?: Date | null;
  parentSpanId?: string | null;
  metadata?: Record<string, unknown>;
  errorSummary?: string | null;
};

export type BuiltTraceSpan = {
  workItemId: number | null;
  runId: number | null;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  kind: ImprovementTraceSpanKind;
  agentName: string | null;
  status: ImprovementTraceSpanStatus;
  metadata: Record<string, unknown>;
  errorSummary: string | null;
  durationMs: number | null;
  startedAt: Date;
  endedAt: Date | null;
};

const SENSITIVE_KEY_PARTS = [
  "token",
  "secret",
  "password",
  "privatekey",
  "authorization",
  "cookie",
  "credential",
];

export function traceIdForExecutorRun(workItemId: number, runId: number): string {
  return `swarm-executor:${workItemId}:${runId}`;
}

export function redactTraceMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactTraceMetadata(item));
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.replace(/[^a-z]/gi, "");
    output[key] = SENSITIVE_KEY_PARTS.some((part) =>
      normalizedKey.toLowerCase().includes(part),
    )
      ? "[redacted]"
      : redactTraceMetadata(child);
  }
  return output;
}

export function buildTraceSpan(input: TraceSpanInput): BuiltTraceSpan {
  const endedAt = input.endedAt ?? null;
  return {
    workItemId: input.workItemId,
    runId: input.runId,
    traceId: input.traceId,
    spanId: randomUUID(),
    parentSpanId: input.parentSpanId ?? null,
    name: input.name,
    kind: input.kind,
    agentName: input.agentName,
    status: input.status,
    metadata: redactTraceMetadata(input.metadata ?? {}) as Record<
      string,
      unknown
    >,
    errorSummary: input.errorSummary ?? null,
    durationMs: endedAt
      ? Math.max(0, endedAt.getTime() - input.startedAt.getTime())
      : null,
    startedAt: input.startedAt,
    endedAt,
  };
}
