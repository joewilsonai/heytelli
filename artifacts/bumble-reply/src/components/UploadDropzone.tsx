import React, { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";
import { Card } from "@/components/ui/card";

interface Props {
  onUploaded: (objectPath: string) => void | Promise<void>;
  onComplete?: (count: number) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
  compact?: boolean;
  multiple?: boolean;
}

export function UploadDropzone({
  onUploaded,
  onComplete,
  disabled,
  label = "Drop screenshot here",
  hint = "Click to browse or Ctrl+V to paste from clipboard",
  compact,
  multiple = false,
}: Props) {
  const [dragActive, setDragActive] = useState(false);
  const [queue, setQueue] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [queueError, setQueueError] = useState<Error | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useUpload();

  const busy = !!disabled || queue.total > 0;

  const processFiles = useCallback(
    async (files: File[]) => {
      const imgs = files.filter((f) => f.type.startsWith("image/"));
      if (imgs.length === 0) return;
      setQueueError(null);
      setQueue({ done: 0, total: imgs.length });
      let successes = 0;
      let failures = 0;
      let lastError: Error | null = null;
      for (let i = 0; i < imgs.length; i++) {
        try {
          const res = await uploadFile(imgs[i]);
          if (res) {
            await onUploaded(res.objectPath);
            successes++;
          } else {
            failures++;
          }
        } catch (err) {
          failures++;
          lastError = err instanceof Error ? err : new Error("Upload failed");
        }
        setQueue({ done: i + 1, total: imgs.length });
      }
      setQueue({ done: 0, total: 0 });
      if (failures > 0 && lastError) {
        const prefix =
          imgs.length > 1
            ? `${failures} of ${imgs.length} failed — `
            : "";
        setQueueError(new Error(prefix + lastError.message));
      }
      if (successes > 0) onComplete?.(successes);
    },
    [uploadFile, onUploaded, onComplete],
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (busy) return;
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length === 0) return;
      processFiles(multiple ? files : files.slice(0, 1));
    },
    [busy, processFiles, multiple],
  );

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (busy) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
            if (!multiple) break;
          }
        }
      }
      if (files.length > 0) processFiles(files);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [busy, processFiles, multiple]);

  const headlineLabel =
    queue.total > 0
      ? multiple && queue.total > 1
        ? `Uploading ${queue.done + 1} of ${queue.total}…`
        : "Uploading…"
      : label;

  return (
    <Card
      className={`w-full ${compact ? "p-6" : "aspect-video md:aspect-[2/1] p-8"} border-3 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all duration-300 cursor-pointer overflow-hidden relative group
        ${dragActive ? "border-primary bg-primary/5 scale-[1.02]" : "border-border/60 hover:border-primary/50 hover:bg-muted/50"}
        ${busy ? "opacity-70 pointer-events-none" : ""}
      `}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      data-testid="dropzone"
    >
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        multiple={multiple}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) {
            processFiles(multiple ? files : files.slice(0, 1));
          }
          e.target.value = "";
        }}
      />
      <div className="bg-background shadow-sm p-3 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300">
        <UploadCloud className="w-8 h-8 text-primary" />
      </div>
      <h3 className={`${compact ? "text-lg" : "text-2xl"} font-bold mb-1`}>
        {headlineLabel}
      </h3>
      <p className="text-muted-foreground text-center text-sm">
        {multiple ? `${hint} · multiple at once` : hint}
      </p>
      {queueError && (
        <p className="text-destructive text-sm mt-3">{queueError.message}</p>
      )}
    </Card>
  );
}
