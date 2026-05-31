import { Link } from "wouter";
import { Plus } from "lucide-react";
import { useListMatches } from "@workspace/api-client-react";
import MatchCard from "@/components/MatchCard";
import { EmptyState, ErrorBanner, LoadingState, PageHeader } from "@/components/State";

export default function Dashboard() {
  const matchesQuery = useListMatches();
  const matches = matchesQuery.data ?? [];
  const activeCount = matches.filter((match) => match.status === "active").length;
  const needsReviewCount = matches.filter(
    (match) => match.pendingScreenshotCount > 0 || match.currentRedFlags.length > 0,
  ).length;
  const datePlanCount = matches.filter((match) => match.nextDateAt || match.dateSafetyPlanStatus.hasPlan).length;

  return (
    <section className="page">
      <PageHeader
        eyebrow="Your matches"
        title="Clarity board"
        action={
          <Link href="/add" className="button primary">
            <Plus size={18} aria-hidden="true" />
            Add
          </Link>
        }
      />

      <div className="summary-strip">
        <div>
          <span>{activeCount}</span>
          <p>Active</p>
        </div>
        <div>
          <span>{needsReviewCount}</span>
          <p>Review</p>
        </div>
        <div>
          <span>{datePlanCount}</span>
          <p>Date plans</p>
        </div>
      </div>

      {matchesQuery.isLoading && <LoadingState label="Loading matches" />}
      {matchesQuery.error && (
        <ErrorBanner
          message={matchesQuery.error instanceof Error ? matchesQuery.error.message : "Could not load matches"}
        />
      )}
      {!matchesQuery.isLoading && !matchesQuery.error && matches.length === 0 && (
        <EmptyState
          title="No matches yet"
          body="Upload a screenshot to start your first Calm Read."
          action={
            <Link href="/add" className="button primary">
              <Plus size={18} aria-hidden="true" />
              Add match
            </Link>
          }
        />
      )}
      <div className="match-grid">
        {matches.map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}
      </div>
    </section>
  );
}
