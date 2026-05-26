import type { TranscriptTurn } from "@workspace/db";

export type ScreenshotForVision = {
  id: number;
  objectPath: string | null;
  rawImagePurgedAt?: Date | string | null;
  extractionStatus?: string;
};

export function selectScreenshotsForVision<T extends ScreenshotForVision>(
  shots: T[],
): Array<T & { objectPath: string }> {
  return shots.filter(
    (shot): shot is T & { objectPath: string } =>
      typeof shot.objectPath === "string" &&
      shot.objectPath.length > 0 &&
      !shot.rawImagePurgedAt,
  );
}

export function analyzedScreenshotCountAfterSuccess(
  shots: Array<{ id: number; extractionStatus: string }>,
  analyzedShotIds: number[],
): number {
  const analyzed = new Set(analyzedShotIds);
  for (const shot of shots) {
    if (shot.extractionStatus === "done") analyzed.add(shot.id);
  }
  return analyzed.size;
}

function transcriptKey(turn: TranscriptTurn): string {
  return `${turn.speaker}:${turn.text.trim().replace(/\s+/g, " ")}`;
}

export function mergeTranscriptTurns(
  existing: TranscriptTurn[],
  incoming: TranscriptTurn[],
): TranscriptTurn[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map(transcriptKey));
  const merged = [...existing];
  for (const turn of incoming) {
    const key = transcriptKey(turn);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(turn);
  }
  return merged;
}

export async function purgeAnalyzedScreenshotObjects(input: {
  shots: Array<{ id: number; objectPath: string | null }>;
  matchPhotoObjectPath?: string | null;
  deleteObject: (objectPath: string) => Promise<void>;
  markScreenshotPurged: (id: number, purgedAt: Date) => Promise<void>;
  clearMatchPhotoObjectPath: (objectPath: string) => Promise<void>;
  onError?: (error: unknown, shot: { id: number; objectPath: string }) => void;
}): Promise<{ purgedCount: number; failedCount: number }> {
  const purgedAt = new Date();
  const purgedPaths = new Set<string>();
  let purgedCount = 0;
  let failedCount = 0;

  for (const shot of input.shots) {
    if (!shot.objectPath) continue;
    const retainedShot = { id: shot.id, objectPath: shot.objectPath };
    try {
      await input.deleteObject(retainedShot.objectPath);
      await input.markScreenshotPurged(retainedShot.id, purgedAt);
      purgedPaths.add(retainedShot.objectPath);
      purgedCount += 1;
    } catch (err) {
      failedCount += 1;
      input.onError?.(err, retainedShot);
    }
  }

  if (
    input.matchPhotoObjectPath &&
    purgedPaths.has(input.matchPhotoObjectPath)
  ) {
    await input.clearMatchPhotoObjectPath(input.matchPhotoObjectPath);
  }

  return { purgedCount, failedCount };
}
