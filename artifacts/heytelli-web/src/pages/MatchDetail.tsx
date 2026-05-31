import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  getGetMatchQueryKey,
  getListMatchesQueryKey,
  useAddScreenshot,
  useGenerateDateBrief,
  useGetMatch,
  useRescoreMatch,
  useUpdateMatch,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, MessageSquare, Save, ShieldAlert, Sparkles, Upload } from "lucide-react";
import { ErrorBanner, LoadingState } from "@/components/State";
import { useObjectImageUrl } from "@/lib/use-object-image";
import { buildEvidenceSections, buildMatchSummary, formatDate } from "@/lib/view-models";
import { uploadImageFile } from "@/lib/upload";

function ScreenshotThumb({ objectPath }: { objectPath: string | null }) {
  const imageUrl = useObjectImageUrl(objectPath);
  if (!imageUrl) return <div className="screenshot-thumb placeholder" />;
  return <img className="screenshot-thumb" src={imageUrl} alt="" loading="lazy" />;
}

export default function MatchDetail() {
  const [, params] = useRoute("/matches/:id");
  const id = params ? Number(params.id) : NaN;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const query = useGetMatch(id, {
    query: {
      enabled: Number.isFinite(id),
      queryKey: getGetMatchQueryKey(id),
      refetchInterval: (result) => {
        const match = result.state.data;
        return match?.screenshots.some((shot) => shot.extractionStatus === "pending") ? 2000 : false;
      },
    },
  });
  const updateMatch = useUpdateMatch();
  const addScreenshot = useAddScreenshot();
  const rescore = useRescoreMatch();
  const dateBrief = useGenerateDateBrief();
  const match = query.data;
  const heroImage = useObjectImageUrl(match?.photoObjectPath);
  const [notes, setNotes] = useState("");
  const [nextDateAt, setNextDateAt] = useState("");
  const [nextDateLocation, setNextDateLocation] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!match) return;
    setNotes(match.notes ?? "");
    setNextDateAt(match.nextDateAt ? match.nextDateAt.slice(0, 16) : "");
    setNextDateLocation(match.nextDateLocation ?? "");
  }, [match]);

  if (!Number.isFinite(id)) {
    return <ErrorBanner message="Invalid match ID" />;
  }

  if (query.isLoading) return <LoadingState label="Loading match" />;
  if (query.error || !match) {
    return (
      <section className="page">
        <ErrorBanner message={query.error instanceof Error ? query.error.message : "Match not found"} />
      </section>
    );
  }

  const summary = buildMatchSummary(match);
  const sections = buildEvidenceSections(match);
  const profile = match.extractedProfile;

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await updateMatch.mutateAsync({
      id,
      data: {
        notes,
        nextDateAt: nextDateAt ? new Date(nextDateAt).toISOString() : null,
        nextDateLocation: nextDateLocation.trim() || null,
      },
    });
    await queryClient.invalidateQueries({ queryKey: getGetMatchQueryKey(id) });
    await queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
  }

  async function handleScreenshot(files: FileList | null): Promise<void> {
    const file = Array.from(files ?? []).find((candidate) => candidate.type.startsWith("image/"));
    if (!file) return;
    setUploadError(null);
    try {
      const objectPath = await uploadImageFile(file);
      await addScreenshot.mutateAsync({ id, data: { objectPath } });
      await rescore.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: getGetMatchQueryKey(id) });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Could not add screenshot");
    }
  }

  async function generateBrief(): Promise<void> {
    await dateBrief.mutateAsync({ id });
    await queryClient.invalidateQueries({ queryKey: getGetMatchQueryKey(id) });
  }

  return (
    <section className="page">
      <header className="detail-header">
        <div className="detail-portrait">
          {heroImage ? <img src={heroImage} alt="" /> : <span className="avatar-fallback">{match.name.slice(0, 2).toUpperCase()}</span>}
        </div>
        <div>
          <p className="kicker">{summary.primaryLabel}</p>
          <h1>{match.name}</h1>
          <p>{summary.body}</p>
          <div className="badge-row">
            {summary.badges.map((badge) => (
              <span className="badge" key={badge}>
                {badge}
              </span>
            ))}
          </div>
        </div>
      </header>

      <div className="detail-grid">
        <article className="panel span-2">
          <div className="panel-title">
            <Sparkles size={18} aria-hidden="true" />
            <h2>Calm Read</h2>
          </div>
          <p>{summary.body}</p>
          <p className="muted">Updated {formatDate(match.lastRead?.generatedAt ?? match.updatedAt)}</p>
        </article>

        <article className="panel">
          <div className="panel-title">
            <ShieldAlert size={18} aria-hidden="true" />
            <h2>Safety Risk</h2>
          </div>
          <p>{summary.safetyLabel}</p>
          <ul className="plain-list">
            {(match.currentRedFlags.length ? match.currentRedFlags : match.historicalRedFlags).slice(0, 3).map((flag) => (
              <li key={`${flag.label}-${flag.evidence}`}>{flag.label}</li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-title">
            <MessageSquare size={18} aria-hidden="true" />
            <h2>Emotional Pace</h2>
          </div>
          <p>{profile.conversationTone || "Not enough conversation yet."}</p>
          <div className="badge-row">
            {profile.mentionedTopics.slice(0, 4).map((topic) => (
              <span className="badge" key={topic}>
                {topic}
              </span>
            ))}
          </div>
        </article>

        <article className="panel span-2">
          <div className="panel-title">
            <CalendarClock size={18} aria-hidden="true" />
            <h2>Date Plan</h2>
          </div>
          <form className="form-grid" onSubmit={(event) => void save(event)}>
            <label>
              <span>When</span>
              <input type="datetime-local" value={nextDateAt} onChange={(event) => setNextDateAt(event.target.value)} />
            </label>
            <label>
              <span>Where</span>
              <input value={nextDateLocation} onChange={(event) => setNextDateLocation(event.target.value)} />
            </label>
            <label className="span-2">
              <span>Notes</span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} />
            </label>
            <div className="button-row span-2">
              <button className="button primary" type="submit" disabled={updateMatch.isPending}>
                <Save size={18} aria-hidden="true" />
                Save
              </button>
              <button className="button ghost" type="button" onClick={() => void generateBrief()} disabled={dateBrief.isPending}>
                <Sparkles size={18} aria-hidden="true" />
                Date brief
              </button>
            </div>
          </form>
          {match.lastDateBrief && <p className="brief-preview">{match.lastDateBrief.brief}</p>}
        </article>

        <article className="panel span-2">
          <div className="panel-title">
            <Upload size={18} aria-hidden="true" />
            <h2>Evidence</h2>
          </div>
          <label className="inline-upload">
            <input type="file" accept="image/*" onChange={(event) => void handleScreenshot(event.target.files)} />
            <Upload size={17} aria-hidden="true" />
            Add screenshot
          </label>
          {uploadError && <ErrorBanner message={uploadError} />}
          <div className="screenshot-row">
            {match.screenshots.map((shot) => (
              <ScreenshotThumb key={shot.id} objectPath={shot.objectPath} />
            ))}
          </div>
          <div className="evidence-grid">
            {sections.map((section) => (
              <section key={section.id} className="evidence-section">
                <h3>{section.title}</h3>
                {section.items.length === 0 ? (
                  <p className="muted">Nothing logged yet.</p>
                ) : (
                  section.items.slice(0, 5).map((item) => (
                    <div className="evidence-item" key={`${section.id}-${item.title}-${item.body}`}>
                      <strong>{item.title}</strong>
                      <p>{item.body}</p>
                    </div>
                  ))
                )}
              </section>
            ))}
          </div>
        </article>
      </div>

      <div className="floating-action-row">
        <Link className="button primary" href={`/chat?match=${match.id}`}>
          <MessageSquare size={18} aria-hidden="true" />
          Chat
        </Link>
      </div>
    </section>
  );
}
