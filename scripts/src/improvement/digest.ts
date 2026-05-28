import { pathToFileURL } from "node:url";

export type ImprovementDigestCounts = {
  read: number;
  workItemsCreated: number;
  duplicatesGrouped: number;
  issuesCreated: number;
  blocked: number;
  waitingForSignal: number;
  dryRun: boolean;
  rolledBack: number;
};

export function buildImprovementDigest(counts: ImprovementDigestCounts): string {
  return [
    "# HeyTelli Improvement Digest",
    "",
    `Mode: ${counts.dryRun ? "dry run" : "live"}`,
    "",
    `Signals read: ${counts.read}`,
    `Work items created: ${counts.workItemsCreated}`,
    `Duplicates grouped: ${counts.duplicatesGrouped}`,
    `${counts.dryRun ? "Issue drafts previewed" : "Issues opened"}: ${counts.issuesCreated}`,
    `Blocked by privacy policy: ${counts.blocked}`,
    `Waiting for more signal: ${counts.waitingForSignal}`,
    `Rollbacks: ${counts.rolledBack}`,
  ].join("\n");
}

async function main(): Promise<void> {
  const digest = buildImprovementDigest({
    read: 0,
    workItemsCreated: 0,
    duplicatesGrouped: 0,
    issuesCreated: 0,
    blocked: 0,
    waitingForSignal: 0,
    dryRun: true,
    rolledBack: 0,
  });
  console.log(digest);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
