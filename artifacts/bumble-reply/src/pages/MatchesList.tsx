import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListMatches } from "@workspace/api-client-react";
import type { Match, ScoreHistoryPoint } from "@workspace/api-client-react";
import { Sparkles, Plus, Heart, ChevronRight, TrendingUp, TrendingDown, Minus, MessageSquare, CalendarClock, CalendarCheck, CalendarX, Inbox, Hourglass, Archive, Ghost, LayoutGrid, Rows3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { objectPathToUrl } from "@/lib/storage";

type SexTier = "green" | "yellow" | "red" | "gray";

function tierForScore(value: number | null | undefined): SexTier {
  if (value == null) return "gray";
  if (value >= 7) return "green";
  if (value >= 4) return "yellow";
  return "red";
}

const TIER_STYLES: Record<
  SexTier,
  { dot: string; stroke: string; fill: string; label: string; text: string }
> = {
  green: {
    dot: "bg-emerald-500",
    stroke: "stroke-emerald-500",
    fill: "fill-emerald-500/15",
    label: "Hot",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  yellow: {
    dot: "bg-amber-500",
    stroke: "stroke-amber-500",
    fill: "fill-amber-500/15",
    label: "Warm",
    text: "text-amber-600 dark:text-amber-400",
  },
  red: {
    dot: "bg-rose-500",
    stroke: "stroke-rose-500",
    fill: "fill-rose-500/15",
    label: "Cold",
    text: "text-rose-600 dark:text-rose-400",
  },
  gray: {
    dot: "bg-muted-foreground/40",
    stroke: "stroke-muted-foreground/50",
    fill: "fill-muted-foreground/10",
    label: "No data",
    text: "text-muted-foreground",
  },
};

function SexTrendCell({
  history,
  current,
}: {
  history: ScoreHistoryPoint[];
  current: number | null;
}) {
  // Build the sparkline series from history's sexPotential values, plus the
  // current score as the final point if history is empty or stale.
  const points = history
    .map((h) => h.sexPotential)
    .filter((v): v is number => typeof v === "number");
  if (points.length === 0 && current != null) points.push(current);

  const tier = tierForScore(current);
  const style = TIER_STYLES[tier];

  const w = 72;
  const h = 28;
  let path = "";
  let area = "";
  if (points.length >= 2) {
    const stepX = w / (points.length - 1);
    const coords = points.map((v, i) => {
      const x = i * stepX;
      const y = h - (v / 10) * h;
      return [x, y] as const;
    });
    path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    area = `${path} L${w},${h} L0,${h} Z`;
  }

  const delta =
    points.length >= 2 ? points[points.length - 1] - points[0] : 0;
  const TrendIcon =
    points.length < 2 ? Minus : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;

  return (
    <div className="flex flex-col items-end gap-1 flex-shrink-0">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${style.dot}`} aria-hidden />
        <span className={`text-xs font-semibold tabular-nums ${style.text}`}>
          {current != null ? `${current}/10` : "—"}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {points.length >= 2 ? (
          <svg
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            className="overflow-visible"
            aria-hidden
          >
            <path d={area} className={style.fill} stroke="none" />
            <path
              d={path}
              className={style.stroke}
              strokeWidth={1.75}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <div
            className="rounded"
            style={{ width: w, height: h }}
            aria-hidden
          />
        )}
        <TrendIcon className={`w-3 h-3 ${style.text}`} />
      </div>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Sex · {style.label}
      </span>
    </div>
  );
}

type DateBadgeInfo =
  | { kind: "upcoming"; whenLabel: string; location: string | null }
  | { kind: "past"; whenLabel: string; location: string | null }
  | { kind: "none"; potential: number | null };

function relWhenFuture(d: Date): string {
  const diff = d.getTime() - Date.now();
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `in ${Math.max(mins, 1)}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function relWhenPast(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function deriveDateBadge(m: {
  nextDateAt: string | Date | null;
  nextDateLocation: string | null;
  dateHistory: { when: string; location: string }[];
  extractedProfile: { scores: { conversionAbility: { value: number | null } } };
}): DateBadgeInfo {
  const now = Date.now();
  const next = m.nextDateAt ? new Date(m.nextDateAt) : null;
  const nextValid = next && !Number.isNaN(next.getTime()) ? next : null;
  if (nextValid && nextValid.getTime() > now) {
    return {
      kind: "upcoming",
      whenLabel: relWhenFuture(nextValid),
      location: m.nextDateLocation || null,
    };
  }
  const past = (m.dateHistory ?? [])
    .map((e) => ({ ...e, d: new Date(e.when) }))
    .filter((e) => !Number.isNaN(e.d.getTime()) && e.d.getTime() <= now)
    .sort((a, b) => b.d.getTime() - a.d.getTime());
  if (past.length > 0) {
    return {
      kind: "past",
      whenLabel: relWhenPast(past[0].d),
      location: past[0].location || null,
    };
  }
  return {
    kind: "none",
    potential: m.extractedProfile.scores.conversionAbility.value,
  };
}

function DateBadge({ info }: { info: DateBadgeInfo }) {
  if (info.kind === "upcoming") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 text-violet-700 dark:text-violet-300 px-2 py-0.5 text-[11px] font-medium"
        data-testid="badge-date-upcoming"
      >
        <CalendarClock className="w-3 h-3" />
        Date {info.whenLabel}
        {info.location ? ` · ${info.location}` : ""}
      </span>
    );
  }
  if (info.kind === "past") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-medium"
        data-testid="badge-date-past"
      >
        <CalendarCheck className="w-3 h-3" />
        Last date {info.whenLabel}
        {info.location ? ` · ${info.location}` : ""}
      </span>
    );
  }
  const v = info.potential;
  const tone =
    v == null
      ? "bg-muted text-muted-foreground"
      : v >= 7
        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
        : v >= 4
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
          : "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}
      data-testid="badge-date-none"
    >
      <CalendarX className="w-3 h-3" />
      No date · Potential {v != null ? `${v}/10` : "—"}
    </span>
  );
}

type StaleInfo =
  | { kind: "owe"; daysSince: number }
  | { kind: "waiting"; daysSince: number }
  | null;

function daysSince(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function mostRecentActivity(m: Match): Date | null {
  const candidates: number[] = [];
  if (m.lastActivityAt) {
    const a = new Date(m.lastActivityAt).getTime();
    if (!Number.isNaN(a)) candidates.push(a);
  }
  if (m.updatedAt) {
    const u = new Date(m.updatedAt).getTime();
    if (!Number.isNaN(u)) candidates.push(u);
  }
  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates));
}

function deriveStale(m: Match): StaleInfo {
  const ref = mostRecentActivity(m);
  const days = daysSince(ref);
  if (days == null) return null;
  if (m.lastSpeaker === "her") {
    return { kind: "owe", daysSince: days };
  }
  if (days >= 3) return { kind: "waiting", daysSince: days };
  return null;
}

function StaleBadge({ info }: { info: StaleInfo }) {
  if (!info) return null;
  if (info.kind === "owe") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300 px-2 py-0.5 text-[11px] font-medium"
        data-testid="badge-owe-reply"
      >
        <Inbox className="w-3 h-3" />
        You owe her a reply{info.daysSince > 0 ? ` · ${info.daysSince}d` : ""}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium"
      data-testid="badge-waiting"
    >
      <Hourglass className="w-3 h-3" />
      Waiting {info.daysSince}d
    </span>
  );
}

type SortKey = "recent" | "sex" | "conversion" | "upcoming";
type FilterKey = "all" | "upcoming" | "hot" | "owe" | "stale" | "archived" | "ghosted";

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recent activity",
  sex: "Sex potential",
  conversion: "Conversion",
  upcoming: "Date soonest",
};

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "Active",
  upcoming: "Upcoming dates",
  hot: "Hot",
  owe: "You owe reply",
  stale: "Stale",
  archived: "Archived",
  ghosted: "Ghosted",
};

function matchStatus(m: Match): "active" | "archived" | "ghosted" {
  return (m.status ?? "active") as "active" | "archived" | "ghosted";
}

function applySortFilter(matches: Match[], sort: SortKey, filter: FilterKey): Match[] {
  const now = Date.now();
  const filtered = matches.filter((m) => {
    const s = matchStatus(m);
    if (filter === "archived") return s === "archived";
    if (filter === "ghosted") return s === "ghosted";
    if (s !== "active") return false;
    if (filter === "all") return true;
    if (filter === "upcoming") {
      if (!m.nextDateAt) return false;
      const d = new Date(m.nextDateAt);
      return !Number.isNaN(d.getTime()) && d.getTime() > now;
    }
    if (filter === "hot") {
      return (m.extractedProfile.scores.sexPotential.value ?? 0) >= 7;
    }
    if (filter === "owe") return m.lastSpeaker === "her";
    if (filter === "stale") {
      const days = daysSince(mostRecentActivity(m));
      return days != null && days >= 3;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "recent") {
      const ax = mostRecentActivity(a)?.getTime() ?? 0;
      const bx = mostRecentActivity(b)?.getTime() ?? 0;
      return bx - ax;
    }
    if (sort === "sex") {
      return (b.extractedProfile.scores.sexPotential.value ?? -1) -
        (a.extractedProfile.scores.sexPotential.value ?? -1);
    }
    if (sort === "conversion") {
      return (b.extractedProfile.scores.conversionAbility.value ?? -1) -
        (a.extractedProfile.scores.conversionAbility.value ?? -1);
    }
    if (sort === "upcoming") {
      const av = a.nextDateAt ? new Date(a.nextDateAt).getTime() : null;
      const bv = b.nextDateAt ? new Date(b.nextDateAt).getTime() : null;
      const af = av != null && av > now ? av : Infinity;
      const bf = bv != null && bv > now ? bv : Infinity;
      return af - bf;
    }
    return 0;
  });
  return sorted;
}

function formatTimeAgo(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d`;
  return d.toLocaleDateString();
}

type ViewMode = "cards" | "roster";

function StatusPill({ status }: { status: "active" | "archived" | "ghosted" }) {
  if (status === "active") return null;
  const Icon = status === "archived" ? Archive : Ghost;
  const label = status === "archived" ? "Archived" : "Ghosted";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-medium">
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function RosterTable({ rows }: { rows: Match[] }) {
  return (
    <Card className="rounded-2xl overflow-x-auto shadow-sm">
      <table className="w-full text-sm" data-testid="roster-table">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
            <th className="px-3 py-2 font-semibold">Name</th>
            <th className="px-3 py-2 font-semibold">Sex</th>
            <th className="px-3 py-2 font-semibold">Conv</th>
            <th className="px-3 py-2 font-semibold">Chem</th>
            <th className="px-3 py-2 font-semibold">Date</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Activity</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const stale = deriveStale(m);
            const badge = deriveDateBadge(m);
            const sx = m.extractedProfile.scores.sexPotential.value;
            const cv = m.extractedProfile.scores.conversionAbility.value;
            const ch = m.extractedProfile.scores.chemistry.value;
            const recent = mostRecentActivity(m);
            return (
              <tr
                key={m.id}
                className="border-b last:border-b-0 hover:bg-muted/40"
                data-testid={`roster-row-${m.id}`}
              >
                <td className="px-3 py-2.5">
                  <Link href={`/matches/${m.id}`}>
                    <div className="flex items-center gap-2 cursor-pointer">
                      <span className="font-semibold">{m.name}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                        {m.extractedProfile.job || ""}
                      </span>
                    </div>
                  </Link>
                </td>
                <td className={`px-3 py-2.5 tabular-nums ${TIER_STYLES[tierForScore(sx)].text}`}>
                  {sx != null ? sx : "—"}
                </td>
                <td className={`px-3 py-2.5 tabular-nums ${TIER_STYLES[tierForScore(cv)].text}`}>
                  {cv != null ? cv : "—"}
                </td>
                <td className={`px-3 py-2.5 tabular-nums ${TIER_STYLES[tierForScore(ch)].text}`}>
                  {ch != null ? ch : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <DateBadge info={badge} />
                </td>
                <td className="px-3 py-2.5">
                  {stale ? (
                    <StaleBadge info={stale} />
                  ) : (
                    <StatusPill status={matchStatus(m)} />
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                  {recent ? formatTimeAgo(recent) : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <Link href={`/matches/${m.id}`} aria-label={`Open ${m.name}`}>
                    <ChevronRight className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-pointer" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

export default function MatchesList() {
  const { data, isLoading } = useListMatches();
  const matches = data ?? [];
  const [sort, setSort] = useState<SortKey>("recent");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [view, setView] = useState<ViewMode>("cards");
  const visible = useMemo(() => applySortFilter(matches, sort, filter), [matches, sort, filter]);
  const counts = useMemo(() => {
    let archived = 0, ghosted = 0;
    for (const m of matches) {
      const s = matchStatus(m);
      if (s === "archived") archived++;
      else if (s === "ghosted") ghosted++;
    }
    return { archived, ghosted };
  }, [matches]);

  return (
    <div className="min-h-[100dvh] w-full bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/30 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-3xl mx-auto p-6 md:p-10 relative z-10">
        <header className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center p-2.5 bg-primary/20 rounded-xl">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground leading-tight">
                Your Matches
              </h1>
              <p className="text-muted-foreground text-sm">
                {matches.length > 0
                  ? `${matches.length} ${matches.length === 1 ? "match" : "matches"}`
                  : "Smarter replies, every time."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/chat">
              <Button
                variant="outline"
                className="gap-2 rounded-full font-semibold"
                data-testid="button-open-chat"
              >
                <MessageSquare className="w-4 h-4" /> Chat
              </Button>
            </Link>
            <Link href="/new">
              <Button
                className="gap-2 rounded-full font-semibold"
                data-testid="button-add-match"
              >
                <Plus className="w-4 h-4" /> Add match
              </Button>
            </Link>
          </div>
        </header>

        {isLoading && (
          <Card className="rounded-2xl divide-y divide-border overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4 animate-pulse">
                <div className="w-14 h-14 rounded-full bg-muted/60" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 bg-muted/60 rounded" />
                  <div className="h-3 w-2/3 bg-muted/40 rounded" />
                </div>
              </div>
            ))}
          </Card>
        )}

        {!isLoading && matches.length === 0 && (
          <Card className="p-12 flex flex-col items-center text-center rounded-3xl border-dashed">
            <div className="bg-accent/40 p-5 rounded-full mb-5">
              <Heart className="w-10 h-10 text-accent-foreground" />
            </div>
            <h3 className="text-2xl font-bold mb-2">No matches yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              Add your first match by uploading a screenshot. HeyTelli will
              build a profile and help you craft the perfect replies.
            </p>
            <Link href="/new">
              <Button size="lg" className="gap-2 rounded-full" data-testid="button-add-first-match">
                <Plus className="w-5 h-5" /> Add your first match
              </Button>
            </Link>
          </Card>
        )}

        {!isLoading && matches.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(FILTER_LABELS) as FilterKey[]).map((k) => {
                if (k === "archived" && counts.archived === 0) return null;
                if (k === "ghosted" && counts.ghosted === 0) return null;
                const suffix =
                  k === "archived" ? ` (${counts.archived})` :
                  k === "ghosted" ? ` (${counts.ghosted})` : "";
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFilter(k)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      filter === k
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                    data-testid={`filter-${k}`}
                  >
                    {FILTER_LABELS[k]}{suffix}
                  </button>
                );
              })}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex rounded-full bg-muted p-0.5" role="group" aria-label="View mode">
                <button
                  type="button"
                  onClick={() => setView("cards")}
                  className={`rounded-full px-2 py-1 text-xs font-medium transition-colors flex items-center gap-1 ${
                    view === "cards" ? "bg-background shadow-sm" : "text-muted-foreground"
                  }`}
                  data-testid="view-cards"
                  aria-pressed={view === "cards"}
                >
                  <LayoutGrid className="w-3 h-3" /> Cards
                </button>
                <button
                  type="button"
                  onClick={() => setView("roster")}
                  className={`rounded-full px-2 py-1 text-xs font-medium transition-colors flex items-center gap-1 ${
                    view === "roster" ? "bg-background shadow-sm" : "text-muted-foreground"
                  }`}
                  data-testid="view-roster"
                  aria-pressed={view === "roster"}
                >
                  <Rows3 className="w-3 h-3" /> Roster
                </button>
              </div>
              <label className="text-xs text-muted-foreground" htmlFor="sort-select">
                Sort
              </label>
              <select
                id="sort-select"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-full bg-muted px-3 py-1 text-xs font-medium border-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                data-testid="sort-select"
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <option key={k} value={k}>{SORT_LABELS[k]}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {!isLoading && matches.length > 0 && visible.length === 0 && (
          <Card className="p-8 rounded-3xl border-dashed text-center text-muted-foreground">
            No matches in this view. Try a different filter.
          </Card>
        )}

        {!isLoading && visible.length > 0 && view === "roster" && (
          <RosterTable rows={visible} />
        )}

        {!isLoading && visible.length > 0 && view === "cards" && (
          <Card className="rounded-2xl divide-y divide-border overflow-hidden shadow-sm">
            {visible.map((m) => {
              const photo = objectPathToUrl(m.photoObjectPath);
              const subtitle = [m.extractedProfile.job, m.extractedProfile.location]
                .filter(Boolean)
                .join(" · ");
              return (
                <Link key={m.id} href={`/matches/${m.id}`}>
                  <div
                    className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors cursor-pointer group"
                    data-testid={`row-match-${m.id}`}
                  >
                    <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 bg-muted ring-2 ring-background shadow-sm">
                      {photo ? (
                        <img
                          src={photo}
                          alt={m.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/40">
                          <Heart className="w-6 h-6 text-primary" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <h3 className="font-semibold text-base truncate">{m.name}</h3>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatTimeAgo(m.updatedAt)}
                        </span>
                      </div>
                      {subtitle && (
                        <p className="text-muted-foreground text-sm truncate">
                          {subtitle}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        <StatusPill status={matchStatus(m)} />
                        <DateBadge info={deriveDateBadge(m)} />
                        <StaleBadge info={deriveStale(m)} />
                        {m.vibeTags.slice(0, 3).map((t) => (
                          <Badge
                            key={t}
                            variant="secondary"
                            className="rounded-full font-normal text-[10px] px-2 py-0 h-5"
                          >
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <SexTrendCell
                      history={m.scoreHistory ?? []}
                      current={m.extractedProfile.scores.sexPotential.value}
                    />

                    <ChevronRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </div>
                </Link>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
