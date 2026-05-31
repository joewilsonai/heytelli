import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  getListMatchesQueryKey,
  useAddScreenshot,
  useCreateMatch,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ImagePlus, Upload } from "lucide-react";
import { ErrorBanner, PageHeader } from "@/components/State";
import { uploadImageFile } from "@/lib/upload";

type UploadPreview = {
  name: string;
  url: string;
};

export default function AddMatch() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createMatch = useCreateMatch();
  const addScreenshot = useAddScreenshot();
  const [name, setName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<UploadPreview[]>([]);

  const busy = working || createMatch.isPending || addScreenshot.isPending;
  const uploadLabel = busy ? "Uploading" : "Choose screenshots";
  const previewCountLabel = useMemo(() => {
    if (previews.length === 0) return "No images selected";
    return `${previews.length} image${previews.length === 1 ? "" : "s"} ready`;
  }, [previews.length]);

  useEffect(
    () => () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    },
    [previews],
  );

  async function processFiles(files: File[]): Promise<void> {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0 || busy) return;

    previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    setPreviews(images.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })));
    setError(null);
    setWorking(true);

    try {
      let matchId: number | null = null;
      for (const file of images) {
        const objectPath = await uploadImageFile(file);
        if (matchId === null) {
          const match = await createMatch.mutateAsync({
            data: {
              screenshotObjectPath: objectPath,
              name: name.trim() || undefined,
            },
          });
          matchId = match.id;
        } else {
          await addScreenshot.mutateAsync({
            id: matchId,
            data: { objectPath },
          });
        }
      }
      await queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
      if (matchId !== null) setLocation(`/matches/${matchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setWorking(false);
    }
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    void processFiles(files);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setDragging(false);
    void processFiles(Array.from(event.dataTransfer.files ?? []));
  }

  return (
    <section className="page narrow">
      <PageHeader
        eyebrow="New match"
        title="Upload screenshots"
        action={
          <button className="button ghost" type="button" onClick={() => setLocation("/")}>
            <ArrowLeft size={18} aria-hidden="true" />
            Back
          </button>
        }
      />

      <div className="upload-layout">
        <div className="form-stack">
          <label>
            <span>Match name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Optional" />
          </label>
          <label
            className={`drop-zone ${dragging ? "is-dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <input type="file" accept="image/*" multiple onChange={handleInput} disabled={busy} />
            <ImagePlus size={34} aria-hidden="true" />
            <strong>{uploadLabel}</strong>
            <span>{previewCountLabel}</span>
          </label>
          {error && <ErrorBanner message={error} />}
          <button
            className="button primary wide"
            type="button"
            onClick={() => document.querySelector<HTMLInputElement>('.drop-zone input[type="file"]')?.click()}
            disabled={busy}
          >
            <Upload size={18} aria-hidden="true" />
            {busy ? "Saving" : "Browse files"}
          </button>
        </div>

        <div className="preview-grid" aria-label="Selected screenshots">
          {previews.length === 0 ? (
            <div className="empty-preview">
              <ImagePlus size={28} aria-hidden="true" />
            </div>
          ) : (
            previews.map((preview) => (
              <img key={preview.url} src={preview.url} alt={preview.name} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
