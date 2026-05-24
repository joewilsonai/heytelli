import { openai } from "@workspace/integrations-openai-ai-server";
import { ObjectStorageService } from "./objectStorage";

const storage = new ObjectStorageService();

/**
 * Download an audio file from object storage and transcribe it via Whisper.
 * Returns plain text.
 */
export async function transcribeAudioObject(objectPath: string): Promise<string> {
  const file = await storage.getObjectEntityFile(objectPath);
  const [meta] = await file.getMetadata();
  const [buf] = await file.download();
  const contentType = (meta.contentType as string) || "audio/m4a";
  const ext =
    contentType.includes("mp4") || contentType.includes("m4a")
      ? "m4a"
      : contentType.includes("wav")
        ? "wav"
        : contentType.includes("mpeg") || contentType.includes("mp3")
          ? "mp3"
          : contentType.includes("webm")
            ? "webm"
            : contentType.includes("ogg")
              ? "ogg"
              : "m4a";
  // OpenAI SDK accepts a File-like object
  const blob = new Blob([buf], { type: contentType });
  const fileLike = new File([blob], `audio.${ext}`, { type: contentType });
  const result = await openai.audio.transcriptions.create({
    file: fileLike,
    model: "gpt-4o-mini-transcribe",
  });
  return (result.text ?? "").trim();
}
