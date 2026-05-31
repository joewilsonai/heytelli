import { createSign } from "node:crypto";
import { pathToFileURL } from "node:url";

export type AppStoreConnectCredentials = {
  issuerId: string;
  keyId: string;
  privateKey: string;
};

export type AppStoreConnectBuild = {
  id: string;
  version: string | null;
  processingState: string | null;
  uploadedDate: string | null;
  expired: boolean;
};

export type IosBetaMonitorOptions = {
  appId: string;
  appStoreConnectUrl: string;
  jwt: string | null;
  credentials: AppStoreConnectCredentials | null;
  fetchImpl?: typeof fetch;
  now?: Date;
};

export type IosBetaMonitorResult = {
  status:
    | "not_configured"
    | "waiting"
    | "processing"
    | "available"
    | "failed"
    | "expired"
    | "unknown";
  checkedAt: string;
  build: AppStoreConnectBuild | null;
  appStoreConnectUrl: string;
  message: string;
};

const DEFAULT_APP_ID = "6773488324";
const DEFAULT_ASC_URL = "https://appstoreconnect.apple.com/apps/6773488324/testflight/ios";
const DEFAULT_ASC_API_URL = "https://api.appstoreconnect.apple.com";

function base64Url(input: Buffer | string): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n").trim();
}

function derToJose(signature: Buffer): Buffer {
  if (signature[0] !== 0x30) {
    throw new Error("Invalid ECDSA signature");
  }
  let offset = 2;
  if (signature[1] && signature[1] > 0x80) {
    offset = 2 + (signature[1] - 0x80);
  }
  if (signature[offset] !== 0x02) {
    throw new Error("Invalid ECDSA signature");
  }
  const rLength = signature[offset + 1] ?? 0;
  const r = signature.subarray(offset + 2, offset + 2 + rLength);
  offset = offset + 2 + rLength;
  if (signature[offset] !== 0x02) {
    throw new Error("Invalid ECDSA signature");
  }
  const sLength = signature[offset + 1] ?? 0;
  const s = signature.subarray(offset + 2, offset + 2 + sLength);

  function fixed(value: Buffer): Buffer {
    const stripped = value[0] === 0 ? value.subarray(1) : value;
    if (stripped.length > 32) return stripped.subarray(stripped.length - 32);
    if (stripped.length === 32) return stripped;
    return Buffer.concat([Buffer.alloc(32 - stripped.length), stripped]);
  }

  return Buffer.concat([fixed(r), fixed(s)]);
}

export function createAppStoreConnectJwt(input: {
  credentials: AppStoreConnectCredentials;
  now?: Date;
  expirationSeconds?: number;
}): string {
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const header = {
    alg: "ES256",
    kid: input.credentials.keyId,
    typ: "JWT",
  };
  const payload = {
    iss: input.credentials.issuerId,
    iat: nowSeconds,
    exp: nowSeconds + (input.expirationSeconds ?? 20 * 60),
    aud: "appstoreconnect-v1",
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(
    JSON.stringify(payload),
  )}`;
  const derSignature = createSign("SHA256")
    .update(signingInput)
    .sign(normalizePrivateKey(input.credentials.privateKey));
  return `${signingInput}.${base64Url(derToJose(derSignature))}`;
}

export function appStoreConnectCredentialsFromEnv(
  env = process.env,
): AppStoreConnectCredentials | null {
  const issuerId =
    env.APP_STORE_CONNECT_ISSUER_ID || env.ASC_ISSUER_ID || env.ASC_ISSUER;
  const keyId = env.APP_STORE_CONNECT_KEY_ID || env.ASC_KEY_ID;
  const privateKey =
    env.APP_STORE_CONNECT_PRIVATE_KEY || env.ASC_PRIVATE_KEY || env.ASC_KEY;
  if (!issuerId || !keyId || !privateKey) return null;
  return { issuerId, keyId, privateKey };
}

export function parseIosBetaMonitorArgs(
  argv: string[],
  env = process.env,
): IosBetaMonitorOptions {
  function argValue(flag: string): string | null {
    const eqPrefix = `${flag}=`;
    const withEquals = argv.find((arg) => arg.startsWith(eqPrefix));
    if (withEquals) return withEquals.slice(eqPrefix.length);
    const index = argv.indexOf(flag);
    if (index >= 0) return argv[index + 1] ?? null;
    return null;
  }

  return {
    appId:
      argValue("--app-id") ||
      env.HEYTELLI_APP_STORE_APP_ID ||
      env.APP_STORE_CONNECT_APP_ID ||
      DEFAULT_APP_ID,
    appStoreConnectUrl:
      argValue("--app-store-connect-url") ||
      env.HEYTELLI_TESTFLIGHT_URL ||
      DEFAULT_ASC_URL,
    jwt: argValue("--jwt") || env.APP_STORE_CONNECT_JWT || null,
    credentials: appStoreConnectCredentialsFromEnv(env),
  };
}

export function latestBuildsUrl(appId: string, apiUrl = DEFAULT_ASC_API_URL): string {
  const fields = [
    "version",
    "uploadedDate",
    "processingState",
    "expired",
    "buildAudienceType",
  ].join(",");
  return `${apiUrl}/v1/apps/${encodeURIComponent(
    appId,
  )}/builds?sort=-uploadedDate&limit=1&fields%5Bbuilds%5D=${encodeURIComponent(
    fields,
  )}`;
}

export function buildFromAppStoreConnectResponse(
  data: unknown,
): AppStoreConnectBuild | null {
  if (!data || typeof data !== "object" || !("data" in data)) return null;
  const rows = (data as { data?: unknown }).data;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const [row] = rows;
  if (!row || typeof row !== "object") return null;
  const attributes = (row as { attributes?: unknown }).attributes;
  if (!attributes || typeof attributes !== "object") return null;
  const attrs = attributes as Record<string, unknown>;
  return {
    id: typeof (row as { id?: unknown }).id === "string" ? (row as { id: string }).id : "unknown",
    version: typeof attrs.version === "string" ? attrs.version : null,
    processingState:
      typeof attrs.processingState === "string" ? attrs.processingState : null,
    uploadedDate:
      typeof attrs.uploadedDate === "string" ? attrs.uploadedDate : null,
    expired: attrs.expired === true,
  };
}

export function statusForBuild(
  build: AppStoreConnectBuild | null,
): Exclude<IosBetaMonitorResult["status"], "not_configured"> {
  if (!build) return "waiting";
  if (build.expired) return "expired";
  const state = build.processingState?.toUpperCase() ?? "";
  if (state === "VALID") return "available";
  if (state === "FAILED" || state === "INVALID") return "failed";
  if (state === "PROCESSING") return "processing";
  return "unknown";
}

export function messageForBetaStatus(
  status: IosBetaMonitorResult["status"],
  build: AppStoreConnectBuild | null,
): string {
  const buildText = build?.version ? `build ${build.version}` : "latest build";
  switch (status) {
    case "not_configured":
      return "App Store Connect API credentials are not configured.";
    case "waiting":
      return "No TestFlight build is visible in App Store Connect yet.";
    case "processing":
      return `${buildText} is uploaded and still processing.`;
    case "available":
      return `${buildText} is processed and available in TestFlight.`;
    case "failed":
      return `${buildText} failed App Store Connect processing.`;
    case "expired":
      return `${buildText} is expired in TestFlight.`;
    case "unknown":
      return `${buildText} has an unrecognized processing state.`;
  }
}

export async function runIosBetaMonitor(
  options: IosBetaMonitorOptions,
): Promise<IosBetaMonitorResult> {
  const checkedAt = (options.now ?? new Date()).toISOString();
  const jwt =
    options.jwt ||
    (options.credentials
      ? createAppStoreConnectJwt({
          credentials: options.credentials,
          now: options.now,
        })
      : null);
  if (!jwt) {
    return {
      status: "not_configured",
      checkedAt,
      build: null,
      appStoreConnectUrl: options.appStoreConnectUrl,
      message: messageForBetaStatus("not_configured", null),
    };
  }

  const response = await (options.fetchImpl ?? fetch)(latestBuildsUrl(options.appId), {
    headers: {
      authorization: `Bearer ${jwt}`,
      accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`App Store Connect build lookup failed: ${response.status}`);
  }
  const build = buildFromAppStoreConnectResponse(await response.json());
  const status = statusForBuild(build);
  return {
    status,
    checkedAt,
    build,
    appStoreConnectUrl: options.appStoreConnectUrl,
    message: messageForBetaStatus(status, build),
  };
}

export function buildIosBetaMonitorDigest(result: IosBetaMonitorResult): string {
  return [
    "# HeyTelli iOS Beta Monitor",
    "",
    `Checked: ${result.checkedAt}`,
    `Status: ${result.status}`,
    `Message: ${result.message}`,
    `Build: ${result.build?.version ?? "none"}`,
    `Processing state: ${result.build?.processingState ?? "unknown"}`,
    `Uploaded: ${result.build?.uploadedDate ?? "unknown"}`,
    `TestFlight: ${result.appStoreConnectUrl}`,
  ].join("\n");
}

async function main(): Promise<void> {
  const result = await runIosBetaMonitor(parseIosBetaMonitorArgs(process.argv.slice(2)));
  console.log(buildIosBetaMonitorDigest(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
