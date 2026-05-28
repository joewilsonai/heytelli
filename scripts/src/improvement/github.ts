import type { GithubIssueDraft } from "@workspace/api-server/src/lib/improvementPipeline";

export type GitHubIssueResult =
  | {
      mode: "dry-run";
      url: null;
      number: null;
      draft: GithubIssueDraft;
    }
  | {
      mode: "live";
      url: string;
      number: number;
      draft: GithubIssueDraft;
    };

export type CreateGitHubIssueOptions = {
  owner: string;
  repo: string;
  token: string | null | undefined;
  draft: GithubIssueDraft;
  dryRun: boolean;
  apiUrl?: string;
  fetchImpl?: typeof fetch;
};

function normalizeApiUrl(value: string | undefined): string {
  return (value ?? "https://api.github.com").replace(/\/+$/, "");
}

export function githubTokenFromEnv(env = process.env): string | null {
  return env.HEYTELLI_GITHUB_TOKEN ?? env.GITHUB_TOKEN ?? env.GH_TOKEN ?? null;
}

export async function createGitHubIssue({
  owner,
  repo,
  token,
  draft,
  dryRun,
  apiUrl,
  fetchImpl = fetch,
}: CreateGitHubIssueOptions): Promise<GitHubIssueResult> {
  if (dryRun) {
    return { mode: "dry-run", url: null, number: null, draft };
  }
  if (!token) {
    throw new Error("GITHUB_TOKEN, GH_TOKEN, or HEYTELLI_GITHUB_TOKEN is required");
  }

  const response = await fetchImpl(
    `${normalizeApiUrl(apiUrl)}/repos/${owner}/${repo}/issues`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({
        title: draft.title,
        body: draft.body,
        labels: draft.labels,
      }),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub issue creation failed: ${response.status} ${text}`);
  }
  const data = (await response.json()) as {
    html_url?: unknown;
    number?: unknown;
  };
  if (typeof data.html_url !== "string" || typeof data.number !== "number") {
    throw new Error("GitHub issue response was missing html_url or number");
  }
  return {
    mode: "live",
    url: data.html_url,
    number: data.number,
    draft,
  };
}
