import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useCreateMatch,
  getListMatchesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UploadDropzone } from "@/components/UploadDropzone";

export default function AddMatch() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const createMatch = useCreateMatch({
    mutation: {
      onSuccess: (match) => {
        queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
        setLocation(`/matches/${match.id}`);
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : "Failed to create match");
      },
    },
  });

  const handleUploaded = (objectPath: string) => {
    setError(null);
    createMatch.mutate({
      data: { screenshotObjectPath: objectPath },
    });
  };

  const busy = createMatch.isPending;

  return (
    <div className="min-h-[100dvh] w-full bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/30 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-3xl mx-auto p-6 md:p-12 relative z-10">
        <Link href="/">
          <Button variant="ghost" className="gap-2 mb-6 -ml-3" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" /> Back to matches
          </Button>
        </Link>

        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-3 bg-primary/20 rounded-2xl mb-3">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
            Add a new match
          </h1>
          <p className="text-muted-foreground text-lg mt-3 max-w-lg mx-auto">
            Drop a screenshot of their profile or chat. We'll save it instantly and read it in the background.
          </p>
        </div>

        {busy ? (
          <Card className="p-12 flex flex-col items-center justify-center min-h-[240px]" data-testid="creating-match">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
              <div className="bg-primary text-primary-foreground p-5 rounded-full relative z-10">
                <Sparkles className="w-8 h-8" />
              </div>
            </div>
            <h3 className="text-2xl font-bold mb-2">Saving your match...</h3>
            <p className="text-muted-foreground">Taking you to their page.</p>
          </Card>
        ) : (
          <UploadDropzone
            onUploaded={handleUploaded}
            label="Drop their screenshot here"
            hint="Click to browse or Ctrl+V to paste from clipboard"
          />
        )}

        {error && (
          <Card className="mt-6 p-5 border-destructive/20 bg-destructive/5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-destructive text-sm">{error}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
