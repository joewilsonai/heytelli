import assert from "node:assert/strict";
import test from "node:test";

import {
  addIssueLabels,
  commentOnIssue,
  fetchGitHubIssue,
  findIssueCommentByMarker,
  listAgentReadyIssues,
  listIssueLabels,
  listSwarmBlockedIssues,
  removeIssueLabels,
} from "./github";

test("lists issue label names from GitHub", async () => {
  const calls: string[] = [];
  const labels = await listIssueLabels({
    owner: "joewilsonai",
    repo: "heytelli",
    token: "token",
    issueNumber: 12,
    fetchImpl: async (input) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify([{ name: "agent-ready" }, { name: "priority:p2" }]),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  assert.deepEqual(labels, ["agent-ready", "priority:p2"]);
  assert.equal(
    calls[0],
    "https://api.github.com/repos/joewilsonai/heytelli/issues/12/labels?per_page=100",
  );
});

test("adds only missing issue labels", async () => {
  const calls: Array<{ input: string; method?: string; body?: string }> = [];

  await addIssueLabels({
    owner: "joewilsonai",
    repo: "heytelli",
    token: "token",
    issueNumber: 12,
    labels: ["agent-ready", "needs-review"],
    fetchImpl: async (input, init) => {
      calls.push({
        input: String(input),
        method: init?.method,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      if (!init?.method) {
        return new Response(JSON.stringify([{ name: "agent-ready" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify([{ name: "needs-review" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.method, "POST");
  assert.equal(calls[1]?.body, JSON.stringify({ labels: ["needs-review"] }));
});

test("does not add labels that are already present", async () => {
  let calls = 0;

  await addIssueLabels({
    owner: "joewilsonai",
    repo: "heytelli",
    token: "token",
    issueNumber: 12,
    labels: ["agent-ready"],
    fetchImpl: async (_input, init) => {
      calls += 1;
      assert.equal(init?.method, undefined);
      return new Response(JSON.stringify([{ name: "agent-ready" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(calls, 1);
});

test("removes only labels present on the issue", async () => {
  const calls: Array<{ input: string; method?: string }> = [];

  await removeIssueLabels({
    owner: "joewilsonai",
    repo: "heytelli",
    token: "token",
    issueNumber: 12,
    labels: ["agent-ready", "missing-label"],
    fetchImpl: async (input, init) => {
      calls.push({ input: String(input), method: init?.method });
      if (!init?.method) {
        return new Response(JSON.stringify([{ name: "agent-ready" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(null, { status: 204 });
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.method, "DELETE");
  assert.match(calls[1]?.input ?? "", /\/labels\/agent-ready$/);
});

test("comments on an issue", async () => {
  const response = await commentOnIssue({
    owner: "joewilsonai",
    repo: "heytelli",
    token: "token",
    issueNumber: 12,
    body: "Triage note without raw payload.",
    fetchImpl: async (input, init) => {
      assert.equal(
        String(input),
        "https://api.github.com/repos/joewilsonai/heytelli/issues/12/comments",
      );
      assert.equal(init?.method, "POST");
      assert.equal(
        init?.body,
        JSON.stringify({ body: "Triage note without raw payload." }),
      );
      return new Response(
        JSON.stringify({
          html_url:
            "https://github.com/joewilsonai/heytelli/issues/12#issuecomment-1",
          id: 1,
        }),
        {
          status: 201,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  assert.equal(response.id, 1);
  assert.match(response.url, /issuecomment-1$/);
});

test("finds an existing issue comment by a deterministic marker", async () => {
  const comment = await findIssueCommentByMarker({
    owner: "joewilsonai",
    repo: "heytelli",
    token: "token",
    issueNumber: 12,
    marker: "heytelli-swarm-plan:7:12",
    fetchImpl: async (input) => {
      assert.equal(
        String(input),
        "https://api.github.com/repos/joewilsonai/heytelli/issues/12/comments?per_page=100",
      );
      return new Response(
        JSON.stringify([
          {
            html_url:
              "https://github.com/joewilsonai/heytelli/issues/12#issuecomment-1",
            id: 1,
            body: "ordinary comment",
          },
          {
            html_url:
              "https://github.com/joewilsonai/heytelli/issues/12#issuecomment-2",
            id: 2,
            body: "<!-- heytelli-swarm-plan:7:12 -->",
          },
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  assert.deepEqual(comment, {
    url: "https://github.com/joewilsonai/heytelli/issues/12#issuecomment-2",
    id: 2,
  });
});

test("returns null when no issue comment marker exists", async () => {
  const comment = await findIssueCommentByMarker({
    owner: "joewilsonai",
    repo: "heytelli",
    token: "token",
    issueNumber: 12,
    marker: "heytelli-swarm-plan:7:12",
    fetchImpl: async () =>
      new Response(JSON.stringify([{ id: 1, body: "ordinary comment" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });

  assert.equal(comment, null);
});

test("fetches an issue summary without exposing body text", async () => {
  const issue = await fetchGitHubIssue({
    owner: "joewilsonai",
    repo: "heytelli",
    token: "token",
    issueNumber: 12,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          html_url: "https://github.com/joewilsonai/heytelli/issues/12",
          number: 12,
          title: "Feedback: confusing flow",
          state: "open",
          labels: [{ name: "feedback" }],
          body: "raw transcript should not be returned by helper",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
  });

  assert.deepEqual(issue, {
    url: "https://github.com/joewilsonai/heytelli/issues/12",
    number: 12,
    title: "Feedback: confusing flow",
    state: "open",
    labels: ["feedback"],
  });
});

test("lists open agent-ready issues without exposing body text", async () => {
  const calls: string[] = [];
  const issues = await listAgentReadyIssues({
    owner: "joewilsonai",
    repo: "heytelli",
    token: "token",
    limit: 5,
    fetchImpl: async (input) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          items: [
            {
              html_url: "https://github.com/joewilsonai/heytelli/issues/12",
              number: 12,
              title: "Feedback: confusing flow",
              state: "open",
              labels: [{ name: "agent-ready" }],
              body: "raw issue text should not be returned",
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  assert.deepEqual(issues, [
    {
      url: "https://github.com/joewilsonai/heytelli/issues/12",
      number: 12,
      title: "Feedback: confusing flow",
      state: "open",
      labels: ["agent-ready"],
    },
  ]);
  assert.match(
    calls[0] ?? "",
    /\/search\/issues\?q=repo%3Ajoewilsonai%2Fheytelli.*label%3Aagent-ready&per_page=5$/,
  );
});

test("lists open swarm-blocked issues for recovery planning", async () => {
  const calls: string[] = [];
  const issues = await listSwarmBlockedIssues({
    owner: "joewilsonai",
    repo: "heytelli",
    token: "token",
    limit: 3,
    fetchImpl: async (input) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          items: [
            {
              html_url: "https://github.com/joewilsonai/heytelli/issues/53",
              number: 53,
              title: "Date Card hardening: backend recovery",
              state: "open",
              labels: [{ name: "swarm-blocked" }],
              body: "private architecture note should not be returned",
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  assert.deepEqual(issues, [
    {
      url: "https://github.com/joewilsonai/heytelli/issues/53",
      number: 53,
      title: "Date Card hardening: backend recovery",
      state: "open",
      labels: ["swarm-blocked"],
    },
  ]);
  assert.match(
    calls[0] ?? "",
    /\/search\/issues\?q=repo%3Ajoewilsonai%2Fheytelli.*label%3Aswarm-blocked&per_page=3$/,
  );
});
