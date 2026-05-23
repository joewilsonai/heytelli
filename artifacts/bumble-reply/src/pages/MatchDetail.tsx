import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMatch,
  useUpdateMatch,
  useDeleteMatch,
  useAddScreenshot,
  useGenerateMatchReplies,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UploadDropzone } from "@/components/UploadDropzone";
import { objectPathToUrl } from "@/lib/storage";

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
  return (
    <Card className="p-6 rounded-3xl" data-testid="scores-card">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> Scores
        </h2>
        {allEmpty && (
          <span className="text-xs text-muted-foreground">
            Add more chat screenshots to unlock
          </span>
        )}
      </div>
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
          {match.screenshots.length} screenshot{match.screenshots.length === 1 ? "" : "s"} ·
          Updated {new Date(match.updatedAt).toLocaleString()}
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

  const addScreenshot = useAddScreenshot({
    mutation: {
      onSuccess: () => {
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
        <Link href="/">
          <Button variant="ghost" className="gap-2 mb-6 -ml-3" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" /> All matches
          </Button>
        </Link>

        <NameHeader match={data} />

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <ScoresCard match={data} />
            <ProfileEditor match={data} />

            <Card className="p-6 rounded-3xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Conversation log</h2>
                <span className="text-sm text-muted-foreground">
                  {data.screenshots.length} screenshot{data.screenshots.length === 1 ? "" : "s"}
                </span>
              </div>
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
                onUploaded={(objectPath) =>
                  addScreenshot.mutateAsync({ id, data: { objectPath } })
                }
                label="Add more screenshots"
                hint="Click, drop, or paste — reads in the background"
              />
              {addScreenshot.isError && (
                <p className="text-destructive text-sm mt-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {(addScreenshot.error as Error)?.message || "Failed to add screenshot"}
                </p>
              )}
            </Card>

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
            <NotesField match={data} />
          </div>
        </div>
      </div>
    </div>
  );
}
