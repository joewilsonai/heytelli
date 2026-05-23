import { Link } from "wouter";
import { useListMatches } from "@workspace/api-client-react";
import { Sparkles, Plus, Heart } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { objectPathToUrl } from "@/lib/storage";

function formatTimeAgo(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function MatchesList() {
  const { data, isLoading } = useListMatches();
  const matches = data ?? [];

  return (
    <div className="min-h-[100dvh] w-full bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/30 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-6xl mx-auto p-6 md:p-12 relative z-10">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10">
          <div>
            <div className="inline-flex items-center justify-center p-3 bg-primary/20 rounded-2xl mb-3">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
              Your Matches
            </h1>
            <p className="text-muted-foreground text-lg mt-2">
              Keep track of every match. Smarter replies, every time.
            </p>
          </div>
          <Link href="/new">
            <Button
              size="lg"
              className="gap-2 rounded-full font-semibold h-12 px-6"
              data-testid="button-add-match"
            >
              <Plus className="w-5 h-5" /> Add match
            </Button>
          </Link>
        </header>

        {isLoading && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="h-64 animate-pulse bg-muted/40" />
            ))}
          </div>
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {matches.map((m) => {
              const photo = objectPathToUrl(m.photoObjectPath);
              return (
                <Link key={m.id} href={`/matches/${m.id}`}>
                  <Card
                    className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer rounded-3xl group h-full flex flex-col"
                    data-testid={`card-match-${m.id}`}
                  >
                    <div className="aspect-[4/3] bg-muted relative overflow-hidden">
                      {photo ? (
                        <img
                          src={photo}
                          alt={m.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/40">
                          <Heart className="w-12 h-12 text-primary" />
                        </div>
                      )}
                    </div>
                    <div className="p-5 flex flex-col flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-xl">{m.name}</h3>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatTimeAgo(m.updatedAt)}
                        </span>
                      </div>
                      {m.extractedProfile.job && (
                        <p className="text-muted-foreground text-sm mt-1">
                          {m.extractedProfile.job}
                          {m.extractedProfile.location ? ` · ${m.extractedProfile.location}` : ""}
                        </p>
                      )}
                      {m.vibeTags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {m.vibeTags.slice(0, 4).map((t) => (
                            <Badge key={t} variant="secondary" className="rounded-full font-normal">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
