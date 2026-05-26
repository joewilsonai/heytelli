export const MAX_PROFILE_ANALYSIS_BATCH_CHARS = 18_000_000;

export type ProfileAnalysisBatchPlan = {
  batches: string[][];
  skippedOversizedIndexes: number[];
};

export function batchProfileAnalysisDataUrls(
  dataUrls: string[],
  options: { maxBatchChars?: number } = {},
): ProfileAnalysisBatchPlan {
  const maxBatchChars =
    options.maxBatchChars ?? MAX_PROFILE_ANALYSIS_BATCH_CHARS;
  const batches: string[][] = [];
  const skippedOversizedIndexes: number[] = [];
  let currentBatch: string[] = [];
  let currentChars = 0;

  dataUrls.forEach((dataUrl, index) => {
    if (dataUrl.length > maxBatchChars) {
      skippedOversizedIndexes.push(index);
      return;
    }

    if (
      currentBatch.length > 0 &&
      currentChars + dataUrl.length > maxBatchChars
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentChars = 0;
    }

    currentBatch.push(dataUrl);
    currentChars += dataUrl.length;
  });

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return { batches, skippedOversizedIndexes };
}
