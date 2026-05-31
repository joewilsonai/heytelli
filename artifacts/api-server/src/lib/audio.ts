import type { AiUsageFeature } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";
import { runAudioTranscriptionTask } from "./modelRouter";

const storage = new ObjectStorageService();

export type AudioTranscriptionContext = {
  feature?: AiUsageFeature;
  userId?: number;
  matchId?: number;
  conversationId?: number;
};

/**
 * Download an audio file from object storage and transcribe it via Whisper.
 * Returns plain text.
 */
export function transcribeAudioObject(objectPath: string): Promise<string>;
export function transcribeAudioObject(
  objectPath: string,
  context: AudioTranscriptionContext,
): Promise<string>;
export async function transcribeAudioObject(
  objectPath: string,
  context: AudioTranscriptionContext = {},
): Promise<string> {
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
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  const blob = new Blob([ab], { type: contentType });
  const fileLike = new File([blob], `audio.${ext}`, { type: contentType });
  return runAudioTranscriptionTask({
    feature: context.feature ?? "post_date_debrief",
    userId: context.userId,
    matchId: context.matchId,
    conversationId: context.conversationId,
    file: fileLike,
    metadata: {
      contentType,
      byteLength: buf.byteLength,
      extension: ext,
    },
  });
}
