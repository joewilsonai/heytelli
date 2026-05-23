import { Link } from "wouter";
import { useListMatches } from "@workspace/api-client-react";
import { Sparkles, Plus, Heart, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { objectPathToUrl } from "@/lib/storage";

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

export default function MatchesList() {
  const { data, isLoading } = useListMatches();
  const matches = data ?? [];

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
          <Link href="/new">
            <Button
              className="gap-2 rounded-full font-semibold"
              data-testid="button-add-match"
            >
              <Plus className="w-4 h-4" /> Add match
            </Button>
          </Link>
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
              Add your first match by uploading a screenshot. Your wingman will
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
          <Card className="rounded-2xl divide-y divide-border overflow-hidden shadow-sm">
            {matches.map((m) => {
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
                      {m.vibeTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
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
                      )}
                    </div>

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
