import { Link } from "wouter";
import type { Match } from "@workspace/api-client-react";
import { AlertTriangle, Clock3, ShieldCheck } from "lucide-react";
import { useObjectImageUrl } from "@/lib/use-object-image";
import { buildMatchSummary, formatDate } from "@/lib/view-models";

export default function MatchCard({ match }: { match: Match }) {
  const imageUrl = useObjectImageUrl(match.photoObjectPath);
  const summary = buildMatchSummary(match);
  const initials = match.name.slice(0, 2).toUpperCase();

  return (
    <Link href={`/matches/${match.id}`} className="match-card">
      <div className="match-card-media">
        {imageUrl ? (
          <img src={imageUrl} alt="" loading="lazy" />
        ) : (
          <span className="avatar-fallback">{initials}</span>
        )}
      </div>
      <div className="match-card-body">
        <div className="match-card-topline">
          <h2>{match.name}</h2>
          <span className={`status-dot ${summary.needsAttention ? "warn" : "ok"}`} aria-hidden="true" />
        </div>
        <p className="kicker">{summary.primaryLabel}</p>
        <p className="line-clamp">{summary.body}</p>
        <div className="meta-grid">
          <span>
            {summary.needsAttention ? <AlertTriangle size={15} /> : <ShieldCheck size={15} />}
            {summary.safetyLabel}
          </span>
          <span>
            <Clock3 size={15} />
            {formatDate(match.lastActivityAt ?? match.updatedAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}
