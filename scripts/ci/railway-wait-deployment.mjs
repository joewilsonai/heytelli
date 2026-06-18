#!/usr/bin/env node

const [serviceName, serviceId, expectedMessage] = process.argv.slice(2);
const token = requiredEnv("RAILWAY_API_TOKEN");
const projectId = requiredEnv("RAILWAY_PROJECT_ID");
const environmentId = requiredEnv("RAILWAY_ENVIRONMENT_ID");
const waitMs = Number(process.env.RAILWAY_DEPLOY_WAIT_MS || 15 * 60 * 1000);

if (!serviceName || !serviceId || !expectedMessage) {
  throw new Error(
    "Usage: railway-wait-deployment.mjs <service-name> <service-id> <expected-cli-message>",
  );
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function latestDeployment() {
  const query = `
    query LatestDeployment($input: DeploymentListInput!) {
      deployments(input: $input, first: 1) {
        edges {
          node {
            id
            status
            createdAt
            meta
          }
        }
      }
    }
  `;

  const response = await fetch("https://backboard.railway.com/graphql/v2", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        input: {
          projectId,
          environmentId,
          serviceId,
        },
      },
    }),
  });
  const payload = await response.json();

  if (!response.ok || payload.errors) {
    throw new Error(`Railway deployment poll failed: ${JSON.stringify(payload.errors || payload)}`);
  }

  return payload.data.deployments.edges[0]?.node || null;
}

const terminalSuccesses = new Set(["SUCCESS", "SKIPPED"]);
const terminalFailures = new Set(["FAILED", "CRASHED", "REMOVED"]);
const deadline = Date.now() + waitMs;

while (Date.now() < deadline) {
  const deployment = await latestDeployment();
  const status = deployment?.status || "UNKNOWN";
  const message = deployment?.meta?.cliMessage || "";
  console.log(`${serviceName} deployment ${deployment?.id || "unknown"}: ${status} (${message})`);

  if (message !== expectedMessage) {
    await sleep(10_000);
    continue;
  }

  if (terminalSuccesses.has(status)) {
    process.exit(0);
  }
  if (terminalFailures.has(status)) {
    process.exit(1);
  }

  await sleep(10_000);
}

throw new Error(`Timed out waiting for ${serviceName} Railway deployment.`);
