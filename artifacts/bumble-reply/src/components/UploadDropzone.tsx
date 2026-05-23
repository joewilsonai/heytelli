import React, { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";
import { Card } from "@/components/ui/card";

interface Props {
  onUploaded: (objectPath: string) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
  compact?: boolean;
}

export function UploadDropzone({
  onUploaded,
  disabled,
  label = "Drop screenshot here",
  hint = "Click to browse or Ctrl+V to paste from clipboard",
  compact,
}: Props) {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading, error } = useUpload({
    onSuccess: (res) => onUploaded(res.objectPath),
  });

  const busy = !!disabled || isUploading;

  const processFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      uploadFile(file);
    },
    [uploadFile],
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
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        processFile(e.dataTransfer.files[0]);
      }
    },
    [busy, processFile],
  );

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (busy) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            processFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [busy, processFile]);

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
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) processFile(e.target.files[0]);
        }}
      />
      <div className="bg-background shadow-sm p-3 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300">
        <UploadCloud className="w-8 h-8 text-primary" />
      </div>
      <h3 className={`${compact ? "text-lg" : "text-2xl"} font-bold mb-1`}>
        {isUploading ? "Uploading..." : label}
      </h3>
      <p className="text-muted-foreground text-center text-sm">{hint}</p>
      {error && (
        <p className="text-destructive text-sm mt-3">{error.message}</p>
      )}
    </Card>
  );
}
