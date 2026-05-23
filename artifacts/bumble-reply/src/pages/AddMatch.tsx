import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useCreateMatch,
  usePreviewMatchExtraction,
  getListMatchesQueryKey,
} from "@workspace/api-client-react";
import type { ExtractedProfile } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Sparkles, AlertCircle, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UploadDropzone } from "@/components/UploadDropzone";
import { objectPathToUrl } from "@/lib/storage";

type Preview = {
  objectPath: string;
  name: string;
  vibeTags: string[];
  extractedProfile: ExtractedProfile;
};

export default function AddMatch() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [interestsText, setInterestsText] = useState("");
  const [topicsText, setTopicsText] = useState("");
  const [tagsText, setTagsText] = useState("");

  const previewExtraction = usePreviewMatchExtraction({
    mutation: {
      onSuccess: (res, vars) => {
        const objectPath = (vars.data as { objectPath: string }).objectPath;
        const next: Preview = {
          objectPath,
          name: res.suggestedName || "New Match",
          vibeTags: res.vibeTags,
          extractedProfile: res.extractedProfile,
        };
        setPreview(next);
        setInterestsText(next.extractedProfile.interests.join(", "));
        setTopicsText(next.extractedProfile.mentionedTopics.join(", "));
        setTagsText(next.vibeTags.join(", "));
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : "Failed to analyze screenshot");
      },
    },
  });

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
    previewExtraction.mutate({ data: { objectPath } });
  };

  const handleConfirm = () => {
    if (!preview) return;
    const finalProfile: ExtractedProfile = {
      ...preview.extractedProfile,
      interests: interestsText.split(",").map((s) => s.trim()).filter(Boolean),
      mentionedTopics: topicsText.split(",").map((s) => s.trim()).filter(Boolean),
    };
    const finalTags = tagsText.split(",").map((s) => s.trim()).filter(Boolean);
    createMatch.mutate({
      data: {
        screenshotObjectPath: preview.objectPath,
        name: preview.name.trim() || "New Match",
        vibeTags: finalTags,
        extractedProfile: finalProfile,
      },
    });
  };

  const handleDiscard = () => {
    setPreview(null);
    setError(null);
  };

  const photoUrl = preview ? objectPathToUrl(preview.objectPath) : null;
  const busy = previewExtraction.isPending || createMatch.isPending;

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
            {preview ? "Review their profile" : "Add a new match"}
          </h1>
          <p className="text-muted-foreground text-lg mt-3 max-w-lg mx-auto">
            {preview
              ? "We extracted this from the screenshot. Edit anything that's off, then confirm."
              : "Drop a screenshot of their profile or chat. We'll extract a name, vibe, and profile to get started."}
          </p>
        </div>

        {previewExtraction.isPending && (
          <Card className="p-12 flex flex-col items-center justify-center min-h-[300px]">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
              <div className="bg-primary text-primary-foreground p-5 rounded-full relative z-10 animate-bounce">
                <Sparkles className="w-8 h-8" />
              </div>
            </div>
            <h3 className="text-2xl font-bold mb-2">Reading the room...</h3>
            <p className="text-muted-foreground">Extracting their vibe and building their profile.</p>
          </Card>
        )}

        {!preview && !previewExtraction.isPending && (
          <UploadDropzone
            onUploaded={handleUploaded}
            label="Drop their screenshot here"
            hint="Click to browse or Ctrl+V to paste from clipboard"
          />
        )}

        {preview && !previewExtraction.isPending && (
          <Card className="p-6 md:p-8 rounded-3xl" data-testid="preview-card">
            <div className="flex flex-col md:flex-row gap-6 mb-6">
              {photoUrl && (
                <div className="w-32 h-32 rounded-2xl overflow-hidden shadow-md bg-muted shrink-0">
                  <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Name
                </label>
                <Input
                  value={preview.name}
                  onChange={(e) => setPreview({ ...preview, name: e.target.value })}
                  className="text-2xl font-bold h-12 mt-1"
                  placeholder="What should we call them?"
                  data-testid="input-preview-name"
                />
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-4 block">
                  Vibe tags (comma-separated)
                </label>
                <Input
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="playful, adventurous"
                  className="mt-1"
                  data-testid="input-preview-tags"
                />
                {tagsText.trim() && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tagsText.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                      <Badge key={t} variant="secondary" className="rounded-full font-normal">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Job</label>
                <Input
                  value={preview.extractedProfile.job ?? ""}
                  onChange={(e) =>
                    setPreview({
                      ...preview,
                      extractedProfile: { ...preview.extractedProfile, job: e.target.value || null },
                    })
                  }
                  placeholder="e.g. Designer at Figma"
                  className="mt-1"
                  data-testid="input-preview-job"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location</label>
                <Input
                  value={preview.extractedProfile.location ?? ""}
                  onChange={(e) =>
                    setPreview({
                      ...preview,
                      extractedProfile: { ...preview.extractedProfile, location: e.target.value || null },
                    })
                  }
                  placeholder="e.g. Brooklyn"
                  className="mt-1"
                  data-testid="input-preview-location"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Interests (comma-separated)
                </label>
                <Input
                  value={interestsText}
                  onChange={(e) => setInterestsText(e.target.value)}
                  placeholder="climbing, jazz, ramen"
                  className="mt-1"
                  data-testid="input-preview-interests"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Things they've mentioned
                </label>
                <Input
                  value={topicsText}
                  onChange={(e) => setTopicsText(e.target.value)}
                  placeholder="trip to Lisbon, dog named Milo"
                  className="mt-1"
                  data-testid="input-preview-topics"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Conversation tone
                </label>
                <Input
                  value={preview.extractedProfile.conversationTone ?? ""}
                  onChange={(e) =>
                    setPreview({
                      ...preview,
                      extractedProfile: {
                        ...preview.extractedProfile,
                        conversationTone: e.target.value || null,
                      },
                    })
                  }
                  placeholder="warm and playful"
                  className="mt-1"
                  data-testid="input-preview-tone"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
              <Button
                variant="outline"
                onClick={handleDiscard}
                disabled={busy}
                className="gap-2 rounded-full"
                data-testid="button-discard-preview"
              >
                <X className="w-4 h-4" /> Start over
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={busy}
                className="gap-2 rounded-full font-semibold"
                data-testid="button-confirm-preview"
              >
                <Check className="w-4 h-4" />
                {createMatch.isPending ? "Creating..." : "Confirm & create match"}
              </Button>
            </div>
          </Card>
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
