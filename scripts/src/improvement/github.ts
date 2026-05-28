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
  dedupeKey?: string;
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
  dedupeKey,
  apiUrl,
  fetchImpl = fetch,
}: CreateGitHubIssueOptions): Promise<GitHubIssueResult> {
  if (dryRun) {
    return { mode: "dry-run", url: null, number: null, draft };
  }
  if (!token) {
    throw new Error("GITHUB_TOKEN, GH_TOKEN, or HEYTELLI_GITHUB_TOKEN is required");
  }
  const normalizedApiUrl = normalizeApiUrl(apiUrl);
  const marker = dedupeKey ? `heytelli-improvement:${dedupeKey}` : null;
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28",
  };

  if (marker) {
    const query = encodeURIComponent(
      `repo:${owner}/${repo} ${marker} in:body type:issue`,
    );
    const searchResponse = await fetchImpl(
      `${normalizedApiUrl}/search/issues?q=${query}`,
      {
        headers,
      },
    );
    if (searchResponse.ok) {
      const data = (await searchResponse.json()) as {
        items?: Array<{ html_url?: unknown; number?: unknown }>;
      };
      const [existing] = data.items ?? [];
      if (
        typeof existing?.html_url === "string" &&
        typeof existing.number === "number"
      ) {
        return {
          mode: "live",
          url: existing.html_url,
          number: existing.number,
          draft,
        };
      }
    }
  }

  const response = await fetchImpl(
    `${normalizedApiUrl}/repos/${owner}/${repo}/issues`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: draft.title,
        body: marker ? `${draft.body}\n\n<!-- ${marker} -->` : draft.body,
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
