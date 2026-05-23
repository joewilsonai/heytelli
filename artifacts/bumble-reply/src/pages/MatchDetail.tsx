import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMatch,
  useUpdateMatch,
  useDeleteMatch,
  useAddScreenshot,
  useGenerateMatchReplies,
  useGenerateDateBrief,
  useRescoreMatch,
  getGetMatchQueryKey,
  getListMatchesQueryKey,
} from "@workspace/api-client-react";
import type {
  MatchDetail as MatchDetailType,
  ExtractedProfile,
  MatchScore,
} from "@workspace/api-client-react";
import {
  ArrowLeft,
  Sparkles,
  Trash2,
  Copy,
  Check,
  RefreshCcw,
  Pencil,
  X,
  Save,
  Heart,
  Plus,
  AlertCircle,
  Flame,
  Zap,
  HeartHandshake,
  CalendarClock,
  CalendarCheck,
  CalendarDays,
  MapPin,
  ChevronDown,
  ChevronUp,
  Archive,
  Ghost,
  Undo2,
  MessageSquare,
  ListTree,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UploadDropzone } from "@/components/UploadDropzone";
import { objectPathToUrl } from "@/lib/storage";

function formatLastUpload(shots: { uploadedAt: string | Date }[]): string {
  if (shots.length === 0) return "";
  const latest = shots.reduce<Date | null>((max, s) => {
    const d = new Date(s.uploadedAt);
    return !max || d > max ? d : max;
  }, null);
  if (!latest) return "";
  const diffMs = Date.now() - latest.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  let rel: string;
  if (diffMin < 1) rel = "just now";
  else if (diffMin < 60) rel = `${diffMin}m ago`;
  else if (diffMin < 60 * 24) rel = `${Math.floor(diffMin / 60)}h ago`;
  else if (diffMin < 60 * 24 * 7) rel = `${Math.floor(diffMin / (60 * 24))}d ago`;
  else rel = `${Math.floor(diffMin / (60 * 24 * 7))}w ago`;
  const abs = latest.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${abs} (${rel})`;
}

function ReplyCard({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Card className="p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow duration-300">
      <p className="text-foreground text-lg leading-relaxed">{text}</p>
      <div className="flex justify-end mt-auto">
        <Button
          variant={copied ? "default" : "secondary"}
          onClick={handleCopy}
          className="w-[110px] gap-2 rounded-full font-semibold"
          data-testid="button-copy-reply"
        >
          {copied ? <><Check className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy</>}
        </Button>
      </div>
    </Card>
  );
}

const SCORE_DEFS: {
  key: "sexPotential" | "conversionAbility" | "chemistry";
  label: string;
  description: string;
  icon: typeof Flame;
}[] = [
  {
    key: "sexPotential",
    label: "Sex potential",
    description: "Likelihood that a first date leads to sex",
    icon: Flame,
  },
  {
    key: "conversionAbility",
    label: "Her conversion",
    description: "How well she moves the chat toward a date",
    icon: Zap,
  },
  {
    key: "chemistry",
    label: "Chemistry",
    description: "Mutual back-and-forth chemistry between you two",
    icon: HeartHandshake,
  },
];

function scoreColor(value: number | null): string {
  if (value === null) return "bg-muted";
  if (value >= 8) return "bg-emerald-500";
  if (value >= 6) return "bg-primary";
  if (value >= 4) return "bg-amber-500";
  return "bg-rose-500";
}

function scoreTextColor(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value >= 8) return "text-emerald-600";
  if (value >= 6) return "text-primary";
  if (value >= 4) return "text-amber-600";
  return "text-rose-600";
}

function ScoresCard({ match }: { match: MatchDetailType }) {
  const scores = match.extractedProfile.scores;
  const allEmpty = SCORE_DEFS.every(
    (def) => scores[def.key].value === null,
  );
  const hasScreenshots = match.screenshots.length > 0;
  const qc = useQueryClient();
  const rescore = useRescoreMatch({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetMatchQueryKey(match.id) });
        qc.invalidateQueries({ queryKey: getListMatchesQueryKey() });
      },
    },
  });
  return (
    <Card className="p-6 rounded-3xl" data-testid="scores-card">
      <div className="flex items-center justify-between mb-5 gap-3">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> Scores
        </h2>
        {hasScreenshots && (
          <Button
            size="sm"
            variant={allEmpty ? "default" : "outline"}
            onClick={() => rescore.mutate({ id: match.id })}
            disabled={rescore.isPending}
            data-testid="button-rescore"
          >
            <RefreshCcw
              className={`w-4 h-4 mr-1.5 ${rescore.isPending ? "animate-spin" : ""}`}
            />
            {rescore.isPending
              ? "Scoring…"
              : allEmpty
                ? "Generate scores"
                : "Re-score"}
          </Button>
        )}
      </div>
      {rescore.isError && (
        <p className="text-destructive text-sm mb-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> Couldn't generate scores — try again.
        </p>
      )}
      <div className="grid sm:grid-cols-3 gap-4">
        {SCORE_DEFS.map((def) => {
          const s: MatchScore = scores[def.key];
          const Icon = def.icon;
          const pct = s.value !== null ? (s.value / 10) * 100 : 0;
          return (
            <div
              key={def.key}
              className="rounded-2xl bg-muted/40 p-4 flex flex-col gap-2"
              data-testid={`score-${def.key}`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Icon className={`w-4 h-4 ${scoreTextColor(s.value)}`} />
                <span>{def.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-4xl font-extrabold ${scoreTextColor(s.value)}`}>
                  {s.value ?? "—"}
                </span>
                <span className="text-muted-foreground text-sm">/10</span>
              </div>
              <div className="h-2 w-full rounded-full bg-background overflow-hidden">
                <div
                  className={`h-full ${scoreColor(s.value)} transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground leading-snug min-h-[2.5rem]">
                {s.rationale ?? def.description}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ProfileEditor({ match }: { match: MatchDetailType }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ExtractedProfile>(match.extractedProfile);
  const [interestsText, setInterestsText] = useState(match.extractedProfile.interests.join(", "));
  const [topicsText, setTopicsText] = useState(match.extractedProfile.mentionedTopics.join(", "));

  useEffect(() => {
    if (!editing) {
      setDraft(match.extractedProfile);
      setInterestsText(match.extractedProfile.interests.join(", "));
      setTopicsText(match.extractedProfile.mentionedTopics.join(", "));
    }
  }, [match.extractedProfile, editing]);

  const updateMatch = useUpdateMatch({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMatchQueryKey(match.id) });
        queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
        setEditing(false);
      },
    },
  });

  const handleSave = () => {
    const parsed: ExtractedProfile = {
      job: draft.job?.trim() || null,
      location: draft.location?.trim() || null,
      conversationTone: draft.conversationTone?.trim() || null,
      interests: interestsText.split(",").map((s) => s.trim()).filter(Boolean),
      mentionedTopics: topicsText.split(",").map((s) => s.trim()).filter(Boolean),
      scores: draft.scores,
    };
    updateMatch.mutate({ id: match.id, data: { extractedProfile: parsed } });
  };

  return (
    <Card className="p-6 rounded-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> AI-extracted profile
        </h2>
        {editing ? (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
              data-testid="button-cancel-profile"
            >
              <X className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateMatch.isPending}
              className="gap-2 rounded-full"
              data-testid="button-save-profile"
            >
              <Save className="w-4 h-4" /> Save
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="gap-2"
            data-testid="button-edit-profile"
          >
            <Pencil className="w-4 h-4" /> Edit
          </Button>
        )}
      </div>

      {editing ? (
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-muted-foreground">Job</label>
            <Input
              value={draft.job ?? ""}
              onChange={(e) => setDraft({ ...draft, job: e.target.value })}
              placeholder="e.g. Designer at Figma"
              data-testid="input-job"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-muted-foreground">Location</label>
            <Input
              value={draft.location ?? ""}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              placeholder="e.g. Brooklyn"
              data-testid="input-location"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-muted-foreground">Interests (comma-separated)</label>
            <Input
              value={interestsText}
              onChange={(e) => setInterestsText(e.target.value)}
              placeholder="climbing, jazz, ramen"
              data-testid="input-interests"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-muted-foreground">Things they've mentioned</label>
            <Input
              value={topicsText}
              onChange={(e) => setTopicsText(e.target.value)}
              placeholder="trip to Lisbon, dog named Milo"
              data-testid="input-topics"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-muted-foreground">Conversation tone</label>
            <Input
              value={draft.conversationTone ?? ""}
              onChange={(e) => setDraft({ ...draft, conversationTone: e.target.value })}
              placeholder="warm and playful"
              data-testid="input-tone"
            />
          </div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
          <ProfileField label="Job" value={match.extractedProfile.job} />
          <ProfileField label="Location" value={match.extractedProfile.location} />
          <ProfileField label="Conversation tone" value={match.extractedProfile.conversationTone} />
          <ProfileListField label="Interests" items={match.extractedProfile.interests} />
          <div className="sm:col-span-2">
            <ProfileListField
              label="Things they've mentioned"
              items={match.extractedProfile.mentionedTopics}
            />
          </div>
        </div>
      )}
    </Card>
  );
}

function ProfileField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-foreground">
        {value || <span className="text-muted-foreground italic">Not yet known</span>}
      </div>
    </div>
  );
}

function ProfileListField({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      {items.length === 0 ? (
        <span className="text-muted-foreground italic">Not yet known</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((i) => (
            <Badge key={i} variant="secondary" className="rounded-full font-normal">
              {i}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function toLocalInputValue(iso: string | Date | null): string {
  if (!iso) return "";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatDateLong(iso: string | Date | null): string {
  if (!iso) return "";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderBriefMarkdown(md: string): React.ReactNode {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let bulletBuf: string[] = [];
  const flushBullets = () => {
    if (bulletBuf.length === 0) return;
    out.push(
      <ul key={`ul-${out.length}`} className="list-disc pl-5 my-2 space-y-1 text-sm">
        {bulletBuf.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>,
    );
    bulletBuf = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^##\s+/.test(line)) {
      flushBullets();
      out.push(
        <h4 key={`h-${out.length}`} className="font-bold text-sm mt-3 mb-1 text-primary">
          {line.replace(/^##\s+/, "")}
        </h4>,
      );
    } else if (/^[*-]\s+/.test(line)) {
      bulletBuf.push(line.replace(/^[*-]\s+/, ""));
    } else if (line.trim() === "") {
      flushBullets();
    } else {
      flushBullets();
      out.push(
        <p key={`p-${out.length}`} className="text-sm leading-relaxed my-1.5">
          {line}
        </p>,
      );
    }
  }
  flushBullets();
  return out;
}

function PreDateBriefCard({ match }: { match: MatchDetailType }) {
  const [brief, setBrief] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const mutation = useGenerateDateBrief({
    mutation: {
      onSuccess: (res) => {
        setBrief(res.brief);
        setGeneratedAt(res.generatedAt);
      },
    },
  });

  const nextAt = match.nextDateAt ? new Date(match.nextDateAt) : null;
  const hasUpcoming =
    nextAt && !Number.isNaN(nextAt.getTime()) && nextAt.getTime() > Date.now();
  if (!hasUpcoming) return null;

  const whenStr = nextAt.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Card className="p-5 rounded-3xl border-violet-500/30 bg-gradient-to-br from-violet-500/5 to-transparent">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h3 className="font-bold text-base flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-violet-500" />
            Pre-date brief
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Date {whenStr}
            {match.nextDateLocation ? ` · ${match.nextDateLocation}` : ""}
          </p>
        </div>
        <Button
          size="sm"
          variant={brief ? "outline" : "default"}
          onClick={() => mutation.mutate({ id: match.id })}
          disabled={mutation.isPending}
          className="rounded-full font-semibold text-xs gap-1.5"
          data-testid="button-generate-brief"
        >
          {mutation.isPending ? (
            <><RefreshCcw className="w-3 h-3 animate-spin" /> Briefing</>
          ) : (
            <><Sparkles className="w-3 h-3" /> {brief ? "Regen" : "Generate"}</>
          )}
        </Button>
      </div>
      {mutation.isError && (
        <p className="text-destructive text-xs mt-2 flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3" />
          {(mutation.error as Error)?.message || "Failed to generate brief"}
        </p>
      )}
      {brief && (
        <div className="mt-3 border-t pt-3">
          {renderBriefMarkdown(brief)}
          {generatedAt && (
            <p className="text-[10px] text-muted-foreground mt-3">
              Generated {new Date(generatedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
      {!brief && !mutation.isPending && !mutation.isError && (
        <p className="text-xs text-muted-foreground mt-2">
          Grok will read her full profile, scores, transcript, and date history
          to build a tactical prep brief.
        </p>
      )}
    </Card>
  );
}

function NextDateCard({ match }: { match: MatchDetailType }) {
  const queryClient = useQueryClient();
  const [when, setWhen] = useState(toLocalInputValue(match.nextDateAt));
  const [location, setLocation] = useState(match.nextDateLocation ?? "");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef({
    when: toLocalInputValue(match.nextDateAt),
    location: match.nextDateLocation ?? "",
  });

  useEffect(() => {
    const incoming = {
      when: toLocalInputValue(match.nextDateAt),
      location: match.nextDateLocation ?? "",
    };
    if (
      incoming.when !== lastSentRef.current.when ||
      incoming.location !== lastSentRef.current.location
    ) {
      setWhen(incoming.when);
      setLocation(incoming.location);
      lastSentRef.current = incoming;
    }
  }, [match.nextDateAt, match.nextDateLocation]);

  const updateMatch = useUpdateMatch({
    mutation: {
      onSuccess: () => {
        setSavedAt(new Date());
        queryClient.invalidateQueries({ queryKey: getGetMatchQueryKey(match.id) });
      },
    },
  });

  useEffect(() => {
    if (
      when === lastSentRef.current.when &&
      location === lastSentRef.current.location
    ) {
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastSentRef.current = { when, location };
      updateMatch.mutate({
        id: match.id,
        data: {
          nextDateAt: fromLocalInputValue(when),
          nextDateLocation: location.trim() ? location.trim() : null,
        },
      });
    }, 800);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [when, location, match.id, updateMatch]);

  const clear = () => {
    setWhen("");
    setLocation("");
  };

  return (
    <Card className="p-6 rounded-3xl">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <CalendarClock className="w-5 h-5" /> Next date
        </h2>
        <span className="text-xs text-muted-foreground">
          {updateMatch.isPending
            ? "Saving..."
            : savedAt
              ? `Saved ${savedAt.toLocaleTimeString()}`
              : "Autosaves"}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Day & time</span>
          <Input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            data-testid="input-next-date-at"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Location</span>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Flight Club, downtown"
            data-testid="input-next-date-location"
          />
        </label>
        {(when || location) && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {when ? formatDateLong(fromLocalInputValue(when)) : "No time set"}
              {location ? ` · ${location}` : ""}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={clear}
              data-testid="button-clear-next-date"
            >
              <X className="w-4 h-4" /> Clear
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

type DateHistoryEntryUI = {
  id: string;
  when: string;
  location: string;
  recap: string;
  createdAt: string;
};

function StatusCard({ match }: { match: MatchDetailType }) {
  const queryClient = useQueryClient();
  const mutation = useUpdateMatch({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMatchQueryKey(match.id) });
        queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
      },
    },
  });
  const status = match.status ?? "active";
  const setStatus = (s: "active" | "archived" | "ghosted") =>
    mutation.mutate({ id: match.id, data: { status: s } });

  const tone =
    status === "archived"
      ? "border-slate-500/30 bg-slate-500/5"
      : status === "ghosted"
        ? "border-zinc-500/30 bg-zinc-500/5"
        : "border-emerald-500/30 bg-emerald-500/5";
  const Icon = status === "ghosted" ? Ghost : status === "archived" ? Archive : Heart;
  const label =
    status === "ghosted" ? "Ghosted" : status === "archived" ? "Archived" : "Active";

  return (
    <Card className={`p-4 rounded-3xl border ${tone}`} data-testid="card-status">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Status: {label}</span>
        </div>
        <div className="flex gap-1.5">
          {status !== "active" && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full text-xs gap-1"
              onClick={() => setStatus("active")}
              disabled={mutation.isPending}
              data-testid="button-status-active"
            >
              <Undo2 className="w-3 h-3" /> Reactivate
            </Button>
          )}
          {status !== "archived" && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full text-xs gap-1"
              onClick={() => setStatus("archived")}
              disabled={mutation.isPending}
              data-testid="button-status-archive"
            >
              <Archive className="w-3 h-3" /> Archive
            </Button>
          )}
          {status !== "ghosted" && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full text-xs gap-1"
              onClick={() => setStatus("ghosted")}
              disabled={mutation.isPending}
              data-testid="button-status-ghosted"
            >
              <Ghost className="w-3 h-3" /> Ghosted
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function PostDateDebriefCard({ match }: { match: MatchDetailType }) {
  const queryClient = useQueryClient();
  const mutation = useUpdateMatch({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMatchQueryKey(match.id) });
        queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
      },
    },
  });
  const [recap, setRecap] = useState("");
  const [dismissed, setDismissed] = useState(false);

  const next = match.nextDateAt ? new Date(match.nextDateAt) : null;
  const isPast =
    next && !Number.isNaN(next.getTime()) && next.getTime() <= Date.now();
  if (!isPast || dismissed) return null;

  const location = match.nextDateLocation ?? "";
  const whenIso = next.toISOString();

  const logIt = () => {
    const entry: DateHistoryEntryUI = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      when: whenIso,
      location,
      recap: recap.trim(),
      createdAt: new Date().toISOString(),
    };
    const nextHistory = [...(match.dateHistory ?? []), entry];
    mutation.mutate(
      {
        id: match.id,
        data: { dateHistory: nextHistory, nextDateAt: null, nextDateLocation: null },
      },
      { onSuccess: () => setRecap("") },
    );
  };

  const skipIt = () => {
    mutation.mutate({
      id: match.id,
      data: { nextDateAt: null, nextDateLocation: null },
    });
  };

  return (
    <Card
      className="p-5 rounded-3xl border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent"
      data-testid="card-post-date-debrief"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h3 className="font-bold text-base flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-emerald-500" />
            How'd the date go?
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDateLong(whenIso)}
            {location ? ` · ${location}` : ""}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setDismissed(true)}
          className="rounded-full -mr-1 -mt-1"
          aria-label="Hide"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      <Textarea
        value={recap}
        onChange={(e) => setRecap(e.target.value)}
        rows={3}
        placeholder="Vibe, what you talked about, did anything happen, next steps…"
        className="mt-2"
        data-testid="textarea-debrief-recap"
      />
      {mutation.isError && (
        <p className="text-destructive text-xs mt-2 flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3" />
          {(mutation.error as Error)?.message || "Failed to save"}
        </p>
      )}
      <div className="flex justify-end gap-2 mt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={skipIt}
          disabled={mutation.isPending}
          data-testid="button-debrief-skip"
        >
          Didn't happen
        </Button>
        <Button
          size="sm"
          onClick={logIt}
          disabled={mutation.isPending || !recap.trim()}
          className="rounded-full gap-1.5"
          data-testid="button-debrief-save"
        >
          <Save className="w-3.5 h-3.5" /> Log it
        </Button>
      </div>
    </Card>
  );
}

type TranscriptTurnUI = { speaker: "her" | "me"; text: string };

function TranscriptEditor({ match }: { match: MatchDetailType }) {
  const queryClient = useQueryClient();
  const mutation = useUpdateMatch({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMatchQueryKey(match.id) });
      },
    },
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const initial = useMemo<TranscriptTurnUI[]>(
    () =>
      Array.isArray(match.transcript)
        ? (match.transcript as TranscriptTurnUI[]).map((t) => ({
            speaker: t.speaker,
            text: t.text,
          }))
        : [],
    [match.transcript],
  );
  const [draft, setDraft] = useState<TranscriptTurnUI[]>(initial);

  useEffect(() => {
    if (!editing) setDraft(initial);
  }, [initial, editing]);

  const startEdit = () => {
    setDraft(initial);
    setEditing(true);
    setOpen(true);
  };
  const cancel = () => {
    setEditing(false);
    setDraft(initial);
  };
  const save = () => {
    const cleaned = draft
      .map((t) => ({ speaker: t.speaker, text: t.text.trim() }))
      .filter((t) => t.text.length > 0);
    if (cleaned.length === 0 && initial.length > 0) {
      const ok = window.confirm(
        `This will erase all ${initial.length} transcript turns. Are you sure?`,
      );
      if (!ok) return;
    }
    mutation.mutate(
      { id: match.id, data: { transcript: cleaned } },
      { onSuccess: () => setEditing(false) },
    );
  };
  const updateTurn = (i: number, patch: Partial<TranscriptTurnUI>) => {
    setDraft((d) => d.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  };
  const removeTurn = (i: number) => {
    setDraft((d) => d.filter((_, idx) => idx !== i));
  };
  const addTurn = (i: number, speaker: "her" | "me") => {
    setDraft((d) => {
      const next = [...d];
      next.splice(i + 1, 0, { speaker, text: "" });
      return next;
    });
  };

  return (
    <Card className="p-6 rounded-3xl" data-testid="card-transcript-editor">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full gap-3 text-left"
        aria-expanded={open}
        aria-controls="transcript-region"
        data-testid="toggle-transcript"
      >
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ListTree className="w-5 h-5" /> Transcript
          {open ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </h2>
        <span className="text-sm text-muted-foreground text-right">
          {initial.length} turn{initial.length === 1 ? "" : "s"}
          <br />
          <span className="text-xs">Fix OCR mistakes here</span>
        </span>
      </button>
      {open && (
        <div className="mt-4" id="transcript-region" role="region" aria-label="Transcript turns">
          <div className="flex justify-end mb-3">
            {editing ? (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={cancel}>
                  <X className="w-4 h-4" /> Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={save}
                  disabled={mutation.isPending}
                  data-testid="button-save-transcript"
                >
                  <Save className="w-4 h-4" /> Save
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={startEdit}
                data-testid="button-edit-transcript"
              >
                <Pencil className="w-4 h-4" /> Edit
              </Button>
            )}
          </div>
          {mutation.isError && (
            <p className="text-destructive text-xs mb-2 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" />
              {(mutation.error as Error)?.message || "Failed to save"}
            </p>
          )}
          {(editing ? draft : initial).length === 0 ? (
            <p className="text-muted-foreground italic text-sm">
              No transcript yet — upload screenshots so AI can extract the conversation.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {(editing ? draft : initial).map((t, i) => (
                <div
                  key={i}
                  className={`flex gap-2 items-start ${
                    t.speaker === "me" ? "flex-row-reverse" : ""
                  }`}
                  data-testid={`transcript-turn-${i}`}
                >
                  <span
                    className={`text-[10px] uppercase tracking-wide font-bold px-2 py-1 rounded-full flex-shrink-0 ${
                      t.speaker === "her"
                        ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                        : "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                    }`}
                  >
                    {t.speaker === "her" ? "Her" : "Me"}
                  </span>
                  {editing ? (
                    <div className="flex-1 flex flex-col gap-1">
                      <Textarea
                        value={t.text}
                        onChange={(e) => updateTurn(i, { text: e.target.value })}
                        rows={2}
                        className="text-sm"
                      />
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            updateTurn(i, { speaker: t.speaker === "her" ? "me" : "her" })
                          }
                          className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1"
                          data-testid={`button-flip-speaker-${i}`}
                        >
                          Flip speaker
                        </button>
                        <button
                          type="button"
                          onClick={() => removeTurn(i)}
                          className="text-[10px] text-rose-500 hover:text-rose-600 px-2 py-1"
                          data-testid={`button-remove-turn-${i}`}
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          onClick={() => addTurn(i, "her")}
                          className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1"
                        >
                          + Her below
                        </button>
                        <button
                          type="button"
                          onClick={() => addTurn(i, "me")}
                          className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1"
                        >
                          + Me below
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p
                      className={`flex-1 text-sm whitespace-pre-wrap rounded-2xl px-3 py-2 ${
                        t.speaker === "her" ? "bg-muted/60" : "bg-primary/10"
                      }`}
                    >
                      {t.text}
                    </p>
                  )}
                </div>
              ))}
              {editing && (
                <div className="flex justify-center gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDraft((d) => [...d, { speaker: "her", text: "" }])}
                    data-testid="button-append-her"
                  >
                    + Her turn
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDraft((d) => [...d, { speaker: "me", text: "" }])}
                    data-testid="button-append-me"
                  >
                    + My turn
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function DateHistoryCard({ match }: { match: MatchDetailType }) {
  const queryClient = useQueryClient();
  const entries: DateHistoryEntryUI[] = useMemo(
    () => (Array.isArray(match.dateHistory) ? (match.dateHistory as DateHistoryEntryUI[]) : []),
    [match.dateHistory],
  );
  const [adding, setAdding] = useState(false);
  const [newWhen, setNewWhen] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newRecap, setNewRecap] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWhen, setEditWhen] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editRecap, setEditRecap] = useState("");

  const updateMatch = useUpdateMatch({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMatchQueryKey(match.id) });
      },
    },
  });

  const save = (next: DateHistoryEntryUI[]) => {
    updateMatch.mutate({ id: match.id, data: { dateHistory: next } });
  };

  const startAdd = () => {
    setAdding(true);
    setNewWhen(toLocalInputValue(new Date()));
    setNewLocation("");
    setNewRecap("");
  };

  const cancelAdd = () => {
    setAdding(false);
    setNewWhen("");
    setNewLocation("");
    setNewRecap("");
  };

  const submitAdd = () => {
    const whenIso = fromLocalInputValue(newWhen);
    if (!whenIso) return;
    const entry: DateHistoryEntryUI = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      when: whenIso,
      location: newLocation.trim(),
      recap: newRecap.trim(),
      createdAt: new Date().toISOString(),
    };
    save([...entries, entry]);
    cancelAdd();
  };

  const startEdit = (e: DateHistoryEntryUI) => {
    setEditingId(e.id);
    setEditWhen(toLocalInputValue(e.when));
    setEditLocation(e.location);
    setEditRecap(e.recap);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const submitEdit = () => {
    if (!editingId) return;
    const whenIso = fromLocalInputValue(editWhen);
    if (!whenIso) return;
    const next = entries.map((e) =>
      e.id === editingId
        ? {
            ...e,
            when: whenIso,
            location: editLocation.trim(),
            recap: editRecap.trim(),
          }
        : e,
    );
    save(next);
    setEditingId(null);
  };

  const removeEntry = (id: string) => {
    if (!window.confirm("Delete this date entry?")) return;
    save(entries.filter((e) => e.id !== id));
  };

  const sorted = [...entries].sort((a, b) => b.when.localeCompare(a.when));

  return (
    <Card className="p-6 rounded-3xl">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <CalendarDays className="w-5 h-5" /> Date history
        </h2>
        {!adding && (
          <Button
            variant="outline"
            size="sm"
            onClick={startAdd}
            data-testid="button-add-date-entry"
          >
            <Plus className="w-4 h-4" /> Log date
          </Button>
        )}
      </div>

      {adding && (
        <div className="border border-dashed rounded-2xl p-3 mb-3 flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">When</span>
            <Input
              type="datetime-local"
              value={newWhen}
              onChange={(e) => setNewWhen(e.target.value)}
              data-testid="input-new-date-when"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Location</span>
            <Input
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              placeholder="Where did you go?"
              data-testid="input-new-date-location"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">How did it go?</span>
            <Textarea
              value={newRecap}
              onChange={(e) => setNewRecap(e.target.value)}
              rows={3}
              placeholder="Vibe, what you talked about, did anything happen, next steps…"
              data-testid="textarea-new-date-recap"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={cancelAdd}>
              <X className="w-4 h-4" /> Cancel
            </Button>
            <Button
              size="sm"
              onClick={submitAdd}
              disabled={!newWhen || updateMatch.isPending}
              data-testid="button-save-date-entry"
            >
              <Save className="w-4 h-4" /> Save
            </Button>
          </div>
        </div>
      )}

      {sorted.length === 0 && !adding ? (
        <p className="text-muted-foreground italic text-sm">
          No dates logged yet. After each date, add what happened so Grok and the scores stay current.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((e) => (
            <div
              key={e.id}
              className="rounded-2xl border p-3"
              data-testid={`date-entry-${e.id}`}
            >
              {editingId === e.id ? (
                <div className="flex flex-col gap-2">
                  <Input
                    type="datetime-local"
                    value={editWhen}
                    onChange={(ev) => setEditWhen(ev.target.value)}
                  />
                  <Input
                    value={editLocation}
                    onChange={(ev) => setEditLocation(ev.target.value)}
                    placeholder="Location"
                  />
                  <Textarea
                    value={editRecap}
                    onChange={(ev) => setEditRecap(ev.target.value)}
                    rows={3}
                    placeholder="Recap"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={cancelEdit}>
                      <X className="w-4 h-4" /> Cancel
                    </Button>
                    <Button size="sm" onClick={submitEdit} disabled={!editWhen}>
                      <Save className="w-4 h-4" /> Save
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="text-sm font-semibold">{formatDateLong(e.when)}</div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(e)}
                        aria-label="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeEntry(e.id)}
                        aria-label="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  {e.location && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                      <MapPin className="w-3 h-3" /> {e.location}
                    </div>
                  )}
                  {e.recap && (
                    <p className="text-sm whitespace-pre-wrap">{e.recap}</p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function NotesField({ match }: { match: MatchDetailType }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(match.notes);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef(match.notes);

  useEffect(() => {
    if (match.notes !== lastSentRef.current) {
      setValue(match.notes);
      lastSentRef.current = match.notes;
    }
  }, [match.notes]);

  const updateMatch = useUpdateMatch({
    mutation: {
      onSuccess: () => {
        setSavedAt(new Date());
        queryClient.invalidateQueries({ queryKey: getGetMatchQueryKey(match.id) });
      },
    },
  });

  useEffect(() => {
    if (value === lastSentRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastSentRef.current = value;
      updateMatch.mutate({ id: match.id, data: { notes: value } });
    }, 800);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, match.id, updateMatch]);

  return (
    <Card className="p-6 rounded-3xl">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-bold">Your notes</h2>
        <span className="text-xs text-muted-foreground">
          {updateMatch.isPending
            ? "Saving..."
            : savedAt
              ? `Saved ${savedAt.toLocaleTimeString()}`
              : "Autosaves"}
        </span>
      </div>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Private notes only you can see — anything to remember about them, ideas for date plans, etc."
        rows={5}
        className="resize-y"
        data-testid="textarea-notes"
      />
    </Card>
  );
}

function NameHeader({ match }: { match: MatchDetailType }) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(match.name);

  useEffect(() => {
    if (!editing) setDraft(match.name);
  }, [match.name, editing]);

  const updateMatch = useUpdateMatch({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMatchQueryKey(match.id) });
        queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
        setEditing(false);
      },
    },
  });

  const deleteMatch = useDeleteMatch({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
        setLocation("/");
      },
    },
  });

  const photo = objectPathToUrl(match.photoObjectPath);

  return (
    <div className="flex flex-col md:flex-row gap-6 items-start mb-8">
      <div className="w-32 h-32 md:w-40 md:h-40 rounded-3xl overflow-hidden shadow-md bg-muted shrink-0">
        {photo ? (
          <img src={photo} alt={match.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/40">
            <Heart className="w-10 h-10 text-primary" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex gap-2 items-center mb-3">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="text-3xl font-extrabold h-14"
              data-testid="input-match-name"
            />
            <Button
              onClick={() => updateMatch.mutate({ id: match.id, data: { name: draft.trim() || match.name } })}
              disabled={updateMatch.isPending}
              data-testid="button-save-name"
            >
              <Save className="w-4 h-4" />
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} data-testid="button-cancel-name">
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <h1
            className="text-4xl md:text-5xl font-extrabold tracking-tight flex items-center gap-3 mb-3 cursor-pointer group"
            onClick={() => setEditing(true)}
            data-testid="text-match-name"
          >
            {match.name}
            <Pencil className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </h1>
        )}
        {match.vibeTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {match.vibeTags.map((t) => (
              <Badge key={t} variant="secondary" className="rounded-full">
                {t}
              </Badge>
            ))}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {match.screenshots.length} screenshot{match.screenshots.length === 1 ? "" : "s"}
          {match.screenshots.length > 0 && ` · Last upload ${formatLastUpload(match.screenshots)}`}
          {" · "}Updated {new Date(match.updatedAt).toLocaleString()}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (window.confirm(`Delete ${match.name}? This can't be undone.`)) {
            deleteMatch.mutate({ id: match.id });
          }
        }}
        className="text-muted-foreground hover:text-destructive gap-2"
        data-testid="button-delete-match"
      >
        <Trash2 className="w-4 h-4" /> Delete
      </Button>
    </div>
  );
}

export default function MatchDetail() {
  const [, params] = useRoute("/matches/:id");
  const id = params ? Number(params.id) : NaN;
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useGetMatch(id, {
    query: {
      enabled: Number.isFinite(id),
      queryKey: getGetMatchQueryKey(id),
      refetchInterval: (query) => {
        const d = query.state.data as MatchDetailType | undefined;
        if (!d) return false;
        return d.screenshots.some((s) => s.extractionStatus === "pending")
          ? 1500
          : false;
      },
    },
  });
  const [replies, setReplies] = useState<string[] | null>(null);
  const [screenshotsOpen, setScreenshotsOpen] = useState(false);

  const addScreenshot = useAddScreenshot({
    mutation: {
      // Use onSettled so we refetch even if the response errored — the
      // server may have actually persisted the screenshot before failing
      // to reply, and we want the UI to reflect the truth in the DB.
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: getGetMatchQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
      },
    },
  });

  const rescoreAfterUpload = useRescoreMatch({
    mutation: {
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: getGetMatchQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
      },
    },
  });

  const generateReplies = useGenerateMatchReplies({
    mutation: {
      onSuccess: (res) => setReplies(res.replies),
    },
  });

  const screenshotUrls = useMemo(
    () =>
      data
        ? data.screenshots.map((s) => ({
            id: s.id,
            url: objectPathToUrl(s.objectPath),
            uploadedAt: s.uploadedAt,
            extractionStatus: s.extractionStatus,
            extractionError: s.extractionError,
          }))
        : [],
    [data],
  );

  if (!Number.isFinite(id)) {
    return <div className="p-12 text-center">Invalid match.</div>;
  }

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Match not found.</p>
        <Link href="/">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to matches
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[35%] h-[35%] bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[35%] h-[35%] bg-accent/30 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-5xl mx-auto p-6 md:p-12 relative z-10">
        <div className="flex items-center justify-between mb-6">
          <Link href="/">
            <Button variant="ghost" className="gap-2 -ml-3" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" /> All matches
            </Button>
          </Link>
          <Link href={`/chat?match=${data.id}`}>
            <Button
              variant="outline"
              className="gap-2 rounded-full font-semibold"
              data-testid="button-chat-about-match"
            >
              <Sparkles className="w-4 h-4" /> Chat about her
            </Button>
          </Link>
        </div>

        <NameHeader match={data} />

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <ScoresCard match={data} />
            <ProfileEditor match={data} />

            <Card className="p-6 rounded-3xl">
              <button
                type="button"
                onClick={() => setScreenshotsOpen((v) => !v)}
                className="flex items-center justify-between w-full gap-3 text-left"
                data-testid="toggle-screenshots"
                aria-expanded={screenshotsOpen}
                aria-controls="conversation-log-region"
              >
                <h2 className="text-xl font-bold flex items-center gap-2">
                  Conversation log
                  {screenshotsOpen ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </h2>
                <span className="text-sm text-muted-foreground text-right">
                  {data.screenshots.length} screenshot{data.screenshots.length === 1 ? "" : "s"}
                  {data.screenshots.length > 0 && (
                    <>
                      <br />
                      Last upload {formatLastUpload(data.screenshots)}
                    </>
                  )}
                </span>
              </button>
              {screenshotsOpen && (
              <div className="mt-4" id="conversation-log-region" role="region" aria-label="Conversation screenshots">
              {data.screenshots.length === 0 ? (
                <p className="text-muted-foreground italic">No screenshots yet.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                  {screenshotUrls.map((s) => (
                    <a
                      key={s.id}
                      href={s.url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-2xl overflow-hidden border bg-white hover:shadow-md transition-shadow relative"
                      data-testid={`screenshot-${s.id}`}
                    >
                      {s.url && (
                        <img
                          src={s.url}
                          alt=""
                          className={`w-full aspect-[3/4] object-cover ${
                            s.extractionStatus === "pending" ? "opacity-60" : ""
                          }`}
                        />
                      )}
                      {s.extractionStatus === "pending" && (
                        <div
                          className="absolute inset-x-0 top-0 bg-primary/90 text-primary-foreground text-xs font-semibold px-2 py-1 flex items-center justify-center gap-1.5"
                          data-testid={`screenshot-status-pending-${s.id}`}
                        >
                          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                          Analyzing screenshot…
                        </div>
                      )}
                      {s.extractionStatus === "failed" && (
                        <div
                          className="absolute inset-x-0 top-0 bg-destructive/90 text-destructive-foreground text-xs font-semibold px-2 py-1 flex items-center justify-center gap-1.5"
                          data-testid={`screenshot-status-failed-${s.id}`}
                          title={s.extractionError ?? undefined}
                        >
                          <AlertCircle className="w-3.5 h-3.5" />
                          Couldn't read
                        </div>
                      )}
                      <div className="p-2 text-xs text-muted-foreground text-center">
                        {new Date(s.uploadedAt).toLocaleDateString()}
                      </div>
                    </a>
                  ))}
                </div>
              )}
              <UploadDropzone
                compact
                multiple
                onUploaded={async (objectPath) => {
                  await addScreenshot.mutateAsync({ id, data: { objectPath } });
                }}
                onComplete={() => rescoreAfterUpload.mutate({ id })}
                label="Add more screenshots"
                hint="Click, drop, or paste — AI re-reads after upload"
              />
              {rescoreAfterUpload.isPending && (
                <p className="text-muted-foreground text-sm mt-3 flex items-center gap-2">
                  <RefreshCcw className="w-4 h-4 animate-spin" />
                  Reading the full conversation…
                </p>
              )}
              {addScreenshot.isError && (
                <p className="text-destructive text-sm mt-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {(addScreenshot.error as Error)?.message || "Failed to add screenshot"}
                </p>
              )}
              </div>
              )}
            </Card>

            <TranscriptEditor match={data} />

            <Card className="p-6 rounded-3xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" /> Generate replies
                </h2>
                <Button
                  onClick={() => generateReplies.mutate({ id })}
                  disabled={generateReplies.isPending || data.screenshots.length === 0}
                  className="gap-2 rounded-full font-semibold"
                  data-testid="button-generate-replies"
                >
                  {generateReplies.isPending ? (
                    <><RefreshCcw className="w-4 h-4 animate-spin" /> Generating</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> {replies ? "Regenerate" : "Generate 3 replies"}</>
                  )}
                </Button>
              </div>
              {generateReplies.isError && (
                <p className="text-destructive text-sm mb-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {(generateReplies.error as Error)?.message || "Failed to generate replies"}
                </p>
              )}
              {!replies && !generateReplies.isPending && (
                <p className="text-muted-foreground text-sm">
                  Use the full conversation history + extracted profile to suggest 3 tailored replies.
                </p>
              )}
              {replies && (
                <div className="flex flex-col gap-3">
                  {replies.map((r, i) => (
                    <ReplyCard key={i} text={r} />
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="lg:col-span-1 flex flex-col gap-6">
            <StatusCard match={data} />
            <PostDateDebriefCard match={data} />
            <PreDateBriefCard match={data} />
            <NextDateCard match={data} />
            <DateHistoryCard match={data} />
            <NotesField match={data} />
          </div>
        </div>
      </div>
    </div>
  );
}
