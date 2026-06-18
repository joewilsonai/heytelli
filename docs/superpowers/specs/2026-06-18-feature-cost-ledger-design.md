# Feature Cost Ledger Design

## Goal

Compute a feature-creation cost for each beta-feedback work item. The system
shows an estimated dollar cost before agents work, then records actual cost and
effort after the executor finishes.

## Scope

This design covers the autonomous improvement loop only:

- feedback work items in `improvement_work_items`;
- swarm planner/executor/reviewer/lifecycle runs in `improvement_runs`;
- executor trace spans in `improvement_trace_spans`;
- AI usage pricing helpers already used by the API.

It does not try to become a full company accounting system. Billing-provider
imports can come later.

## Cost Model

Each feature cost has two phases:

- `estimate`: calculated before implementation from risk tier, priority, agent
  roles, planned reviewer lanes, historical/default token assumptions, and the
  configured agent model.
- `actual`: calculated after execution from observed token totals when the agent
  output reports them, reviewer counts, trace span durations, and release/build
  markers.

Every dollar value carries a confidence:

- `high`: exact provider cost or exact token buckets;
- `medium`: actual token total with estimated input/output split;
- `low`: purely planned estimate.

The first version uses metadata, not a new table. `improvement_runs.metadata`
stores `featureCostEstimate` when the executor starts and `featureCostActual`
when it completes or fails. API control-room summaries aggregate those fields.

## Pricing

Use the repo pricing registry as the single source for model-token dollars. The
registry must include current OpenAI defaults for the coding models used by
HeyTelli agents, with environment overrides still taking precedence through
`AI_USAGE_PRICING_OVERRIDES_JSON`.

The implementation should not hardcode a claim that every future run uses the
same model. It should record the model name used for the estimate and actual
summary.

## User Experience

The admin control room should show feature-cost fields beside work items:

- estimated cost range;
- actual cost when available;
- confidence;
- effort summary such as agent runs, reviewer lanes, trace duration, and release
  runs;
- cost per requesting user, derived from `frequencyCount`.

User-facing beta feedback status should stay simple. It can mention that a
request is shipped or not planned, but it should not expose internal dollar
figures to beta users unless explicitly added later.

## Error Handling

Missing pricing should produce a zero-dollar model estimate with `low`
confidence and a clear metadata reason. Missing token output should still record
effort counts and estimated model dollars. Failed executor runs should still
record actual partial cost so retries are visible.

## Verification

Tests should cover:

- current pricing defaults for agent models;
- estimating feature cost by risk tier and reviewer lanes;
- parsing Codex token totals from agent output;
- building actual cost from token totals and effort counts;
- aggregating run metadata into control-room work-item cost summaries;
- no sensitive data leaking through cost metadata.
