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

type GitHubRequestOptions = {
  owner: string;
  repo: string;
  token: string | null | undefined;
  apiUrl?: string;
  fetchImpl?: typeof fetch;
};

type GitHubIssueOptions = GitHubRequestOptions & {
  issueNumber: number;
};

export type GitHubIssueSummary = {
  url: string;
  number: number;
  title: string;
  state: string;
  labels: string[];
};

export type GitHubIssueComment = {
  url: string;
  id: number;
};

export type ListIssueLabelsOptions = GitHubIssueOptions;

export type AddIssueLabelsOptions = GitHubIssueOptions & {
  labels: string[];
};

export type RemoveIssueLabelsOptions = GitHubIssueOptions & {
  labels: string[];
};

export type CommentOnIssueOptions = GitHubIssueOptions & {
  body: string;
};

export type FindIssueCommentByMarkerOptions = GitHubIssueOptions & {
  marker: string;
};

export type FetchGitHubIssueOptions = GitHubIssueOptions;

export type ListAgentReadyIssuesOptions = GitHubRequestOptions & {
  limit?: number;
};

function normalizeApiUrl(value: string | undefined): string {
  return (value ?? "https://api.github.com").replace(/\/+$/, "");
}

export function githubTokenFromEnv(env = process.env): string | null {
  return env.HEYTELLI_GITHUB_TOKEN ?? env.GITHUB_TOKEN ?? env.GH_TOKEN ?? null;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "user-agent": "heytelli-improvement-worker",
    "x-github-api-version": "2022-11-28",
  };
}

function requireGitHubToken(token: string | null | undefined): string {
  if (!token) {
    throw new Error(
      "GITHUB_TOKEN, GH_TOKEN, or HEYTELLI_GITHUB_TOKEN is required",
    );
  }
  return token;
}

function repoIssuePath(
  owner: string,
  repo: string,
  issueNumber: number,
): string {
  return `/repos/${owner}/${repo}/issues/${issueNumber}`;
}

function labelNamesFromResponse(data: unknown): string[] {
  if (!Array.isArray(data)) {
    return [];
  }
  return data.flatMap((label) => {
    if (
      typeof label === "object" &&
      label !== null &&
      "name" in label &&
      typeof label.name === "string"
    ) {
      return [label.name];
    }
    return [];
  });
}

function issueSummaryFromResponse(data: {
  html_url?: unknown;
  number?: unknown;
  title?: unknown;
  state?: unknown;
  labels?: unknown;
}): GitHubIssueSummary {
  if (
    typeof data.html_url !== "string" ||
    typeof data.number !== "number" ||
    typeof data.title !== "string" ||
    typeof data.state !== "string"
  ) {
    throw new Error("GitHub issue response was missing summary fields");
  }
  return {
    url: data.html_url,
    number: data.number,
    title: data.title,
    state: data.state,
    labels: labelNamesFromResponse(data.labels),
  };
}

function uniqueNonEmptyLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  return labels.flatMap((label) => {
    const normalized = label.trim();
    if (!normalized || seen.has(normalized.toLowerCase())) {
      return [];
    }
    seen.add(normalized.toLowerCase());
    return [normalized];
  });
}

async function githubJsonRequest(
  options: GitHubRequestOptions & {
    path: string;
    method?: string;
    body?: unknown;
    expectedStatuses?: number[];
  },
): Promise<unknown> {
  const token = requireGitHubToken(options.token);
  const normalizedApiUrl = normalizeApiUrl(options.apiUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const method = options.method ?? "GET";
  const response = await fetchImpl(`${normalizedApiUrl}${options.path}`, {
    method: options.method,
    headers: githubHeaders(token),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const expectedStatuses = options.expectedStatuses ?? [200];
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `GitHub request failed: ${method} ${options.path} ${response.status}`,
    );
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

export async function listIssueLabels({
  owner,
  repo,
  token,
  issueNumber,
  apiUrl,
  fetchImpl = fetch,
}: ListIssueLabelsOptions): Promise<string[]> {
  const data = await githubJsonRequest({
    owner,
    repo,
    token,
    apiUrl,
    fetchImpl,
    path: `${repoIssuePath(owner, repo, issueNumber)}/labels?per_page=100`,
  });
  return labelNamesFromResponse(data);
}

export async function addIssueLabels({
  owner,
  repo,
  token,
  issueNumber,
  labels,
  apiUrl,
  fetchImpl = fetch,
}: AddIssueLabelsOptions): Promise<string[]> {
  const requestedLabels = uniqueNonEmptyLabels(labels);
  if (requestedLabels.length === 0) {
    return [];
  }
  const currentLabels = await listIssueLabels({
    owner,
    repo,
    token,
    issueNumber,
    apiUrl,
    fetchImpl,
  });
  const currentLabelSet = new Set(
    currentLabels.map((label) => label.toLowerCase()),
  );
  const missingLabels = requestedLabels.filter(
    (label) => !currentLabelSet.has(label.toLowerCase()),
  );
  if (missingLabels.length === 0) {
    return [];
  }
  await githubJsonRequest({
    owner,
    repo,
    token,
    apiUrl,
    fetchImpl,
    path: `${repoIssuePath(owner, repo, issueNumber)}/labels`,
    method: "POST",
    body: { labels: missingLabels },
  });
  return missingLabels;
}

export async function removeIssueLabels({
  owner,
  repo,
  token,
  issueNumber,
  labels,
  apiUrl,
  fetchImpl = fetch,
}: RemoveIssueLabelsOptions): Promise<string[]> {
  const requestedLabels = uniqueNonEmptyLabels(labels);
  if (requestedLabels.length === 0) {
    return [];
  }
  const currentLabels = await listIssueLabels({
    owner,
    repo,
    token,
    issueNumber,
    apiUrl,
    fetchImpl,
  });
  const requestedLabelSet = new Set(
    requestedLabels.map((label) => label.toLowerCase()),
  );
  const labelsToRemove = currentLabels.filter((label) =>
    requestedLabelSet.has(label.toLowerCase()),
  );
  for (const label of labelsToRemove) {
    await githubJsonRequest({
      owner,
      repo,
      token,
      apiUrl,
      fetchImpl,
      path: `${repoIssuePath(owner, repo, issueNumber)}/labels/${encodeURIComponent(label)}`,
      method: "DELETE",
      expectedStatuses: [200, 204],
    });
  }
  return labelsToRemove;
}

export async function commentOnIssue({
  owner,
  repo,
  token,
  issueNumber,
  body,
  apiUrl,
  fetchImpl = fetch,
}: CommentOnIssueOptions): Promise<GitHubIssueComment> {
  const data = (await githubJsonRequest({
    owner,
    repo,
    token,
    apiUrl,
    fetchImpl,
    path: `${repoIssuePath(owner, repo, issueNumber)}/comments`,
    method: "POST",
    body: { body },
    expectedStatuses: [201],
  })) as {
    html_url?: unknown;
    id?: unknown;
  };
  if (typeof data.html_url !== "string" || typeof data.id !== "number") {
    throw new Error("GitHub comment response was missing html_url or id");
  }
  return {
    url: data.html_url,
    id: data.id,
  };
}

export async function findIssueCommentByMarker({
  owner,
  repo,
  token,
  issueNumber,
  marker,
  apiUrl,
  fetchImpl = fetch,
}: FindIssueCommentByMarkerOptions): Promise<GitHubIssueComment | null> {
  const data = (await githubJsonRequest({
    owner,
    repo,
    token,
    apiUrl,
    fetchImpl,
    path: `${repoIssuePath(owner, repo, issueNumber)}/comments?per_page=100`,
  })) as Array<{
    html_url?: unknown;
    id?: unknown;
    body?: unknown;
  }>;
  if (!Array.isArray(data)) {
    return null;
  }
  const existing = data.find(
    (comment) =>
      typeof comment.body === "string" && comment.body.includes(marker),
  );
  if (
    typeof existing?.html_url !== "string" ||
    typeof existing.id !== "number"
  ) {
    return null;
  }
  return {
    url: existing.html_url,
    id: existing.id,
  };
}

export async function fetchGitHubIssue({
  owner,
  repo,
  token,
  issueNumber,
  apiUrl,
  fetchImpl = fetch,
}: FetchGitHubIssueOptions): Promise<GitHubIssueSummary> {
  const data = (await githubJsonRequest({
    owner,
    repo,
    token,
    apiUrl,
    fetchImpl,
    path: repoIssuePath(owner, repo, issueNumber),
  })) as {
    html_url?: unknown;
    number?: unknown;
    title?: unknown;
    state?: unknown;
    labels?: unknown;
  };
  return issueSummaryFromResponse(data);
}

export async function listAgentReadyIssues({
  owner,
  repo,
  token,
  limit = 10,
  apiUrl,
  fetchImpl = fetch,
}: ListAgentReadyIssuesOptions): Promise<GitHubIssueSummary[]> {
  const perPage = Math.max(1, Math.min(limit, 100));
  const query = encodeURIComponent(
    `repo:${owner}/${repo} is:issue is:open label:agent-ready`,
  );
  const data = (await githubJsonRequest({
    owner,
    repo,
    token,
    apiUrl,
    fetchImpl,
    path: `/search/issues?q=${query}&per_page=${perPage}`,
  })) as {
    items?: unknown;
  };
  if (!Array.isArray(data.items)) {
    return [];
  }
  return data.items.map((item) =>
    issueSummaryFromResponse(
      item as {
        html_url?: unknown;
        number?: unknown;
        title?: unknown;
        state?: unknown;
        labels?: unknown;
      },
    ),
  );
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
    throw new Error(
      "GITHUB_TOKEN, GH_TOKEN, or HEYTELLI_GITHUB_TOKEN is required",
    );
  }
  const normalizedApiUrl = normalizeApiUrl(apiUrl);
  const marker = dedupeKey ? `heytelli-improvement:${dedupeKey}` : null;
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "user-agent": "heytelli-improvement-worker",
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
    throw new Error(`GitHub issue creation failed: ${response.status}`);
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
