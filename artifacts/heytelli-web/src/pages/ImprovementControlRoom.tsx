import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  GitPullRequest,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  getGetImprovementControlRoomQueryKey,
  useGetImprovementControlRoom,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/State";

function formatCount(value: number | undefined): string {
  return String(value ?? 0);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Open";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function prettyToken(value: string | null | undefined): string {
  if (!value) return "None";
  return value
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function ImprovementControlRoom() {
  const controlRoom = useGetImprovementControlRoom({
    query: {
      queryKey: getGetImprovementControlRoomQueryKey(),
      refetchInterval: 30_000,
    },
  });
  const snapshot = controlRoom.data;

  return (
    <section className="page improvement-room">
      <PageHeader
        eyebrow="Improvements"
        title="Feedback-to-feature factory"
        action={
          <button
            className="button ghost"
            type="button"
            onClick={() => void controlRoom.refetch()}
            disabled={controlRoom.isFetching}
          >
            <RefreshCw size={17} aria-hidden="true" />
            {controlRoom.isFetching ? "Refreshing" : "Refresh"}
          </button>
        }
      />

      {controlRoom.isError ? (
        <div className="error-banner">
          <AlertTriangle size={18} aria-hidden="true" />
          Admin access is required for this control room.
        </div>
      ) : null}

      <div className="factory-metrics">
        <div>
          <Clock3 size={18} aria-hidden="true" />
          <span>{formatCount(snapshot?.queue.waitingForTriage)}</span>
          <p>Waiting</p>
        </div>
        <div>
          <Bot size={18} aria-hidden="true" />
          <span>{formatCount(snapshot?.queue.executable)}</span>
          <p>Agent-ready</p>
        </div>
        <div>
          <GitPullRequest size={18} aria-hidden="true" />
          <span>{formatCount(snapshot?.queue.reviewGated)}</span>
          <p>Review</p>
        </div>
        <div>
          <RotateCcw size={18} aria-hidden="true" />
          <span>{formatCount(snapshot?.queue.reconsiderCandidates)}</span>
          <p>Reconsider</p>
        </div>
      </div>

      <div className="factory-grid">
        <section className="panel factory-panel">
          <div className="panel-title">
            <Bot size={18} aria-hidden="true" />
            <h2>Agent lanes</h2>
          </div>
          <div className="lane-stack">
            {(snapshot?.agentLanes ?? []).map((lane) => (
              <div className="lane-row" key={lane.id}>
                <div>
                  <strong>{lane.label}</strong>
                  <p className="muted">{lane.description}</p>
                </div>
                <span>{lane.activeCount}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel factory-panel">
          <div className="panel-title">
            <RotateCcw size={18} aria-hidden="true" />
            <h2>Reconsider queue</h2>
          </div>
          <div className="work-stack">
            {(snapshot?.reconsiderCandidates ?? []).length === 0 ? (
              <p className="muted">No declined request has crossed its demand threshold.</p>
            ) : (
              snapshot?.reconsiderCandidates.map((item) => (
                <article className="work-row" key={item.id}>
                  <strong>{item.title}</strong>
                  <p>{item.decisionDetails ?? prettyToken(item.decisionCategory)}</p>
                  <span>
                    {item.frequencyCount}/{item.decisionReconsiderAfterCount} requests
                  </span>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="factory-grid wide">
        <section className="panel factory-panel">
          <div className="panel-title">
            <Sparkles size={18} aria-hidden="true" />
            <h2>Recent work</h2>
          </div>
          <div className="work-stack">
            {(snapshot?.recentWorkItems ?? []).map((item) => (
              <article className="work-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>
                    {prettyToken(item.status)} · {prettyToken(item.category)} ·{" "}
                    {prettyToken(item.riskTier)}
                  </p>
                </div>
                <span>{item.frequencyCount} asks</span>
              </article>
            ))}
          </div>
        </section>

        <section className="panel factory-panel">
          <div className="panel-title">
            <CheckCircle2 size={18} aria-hidden="true" />
            <h2>Agent run log</h2>
          </div>
          <div className="run-stack">
            {(snapshot?.recentRuns ?? []).map((run, index) => (
              <article className="run-row" key={`${run.agentName}-${run.createdAt}-${index}`}>
                <div>
                  <strong>{run.agentName}</strong>
                  <p>{run.summary}</p>
                </div>
                <span>
                  {prettyToken(run.runType)} · {prettyToken(run.status)} ·{" "}
                  {formatDate(run.completedAt ?? run.createdAt)}
                </span>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="panel factory-panel">
        <div className="panel-title">
          <GitPullRequest size={18} aria-hidden="true" />
          <h2>Demo script</h2>
        </div>
        <ol className="demo-script">
          {(snapshot?.demoScript ?? []).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </section>
  );
}
