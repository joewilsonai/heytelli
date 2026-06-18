import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  buildFromAppStoreConnectResponse,
  buildIosBetaMonitorDigest,
  createAppStoreConnectJwt,
  latestBuildsUrl,
  messageForBetaStatus,
  parseIosBetaMonitorArgs,
  runIosBetaMonitor,
  statusForBuild,
} from "./iosBetaMonitor";

test("builds the App Store Connect latest TestFlight build URL", () => {
  const url = latestBuildsUrl("6773488324");

  assert.match(url, /\/v1\/builds/);
  assert.match(url, /filter%5Bapp%5D=6773488324/);
  assert.match(url, /sort=-uploadedDate/);
  assert.match(url, /limit=1/);
  assert.match(url, /processingState/);
});

test("parses latest build processing state", () => {
  const build = buildFromAppStoreConnectResponse({
    data: [
      {
        id: "abc",
        attributes: {
          version: "41",
          processingState: "PROCESSING",
          uploadedDate: "2026-05-30T21:00:00Z",
          expired: false,
        },
      },
    ],
  });

  assert.deepEqual(build, {
    id: "abc",
    version: "41",
    processingState: "PROCESSING",
    uploadedDate: "2026-05-30T21:00:00Z",
    expired: false,
  });
  assert.equal(statusForBuild(build), "processing");
  assert.equal(
    messageForBetaStatus("processing", build),
    "build 41 is uploaded and still processing.",
  );
});

test("maps App Store Connect states into beta availability", () => {
  assert.equal(statusForBuild(null), "waiting");
  assert.equal(
    statusForBuild({
      id: "1",
      version: "41",
      processingState: "VALID",
      uploadedDate: null,
      expired: false,
    }),
    "available",
  );
  assert.equal(
    statusForBuild({
      id: "1",
      version: "41",
      processingState: "FAILED",
      uploadedDate: null,
      expired: false,
    }),
    "failed",
  );
});

test("creates an App Store Connect JWT from local credentials", () => {
  const { privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const jwt = createAppStoreConnectJwt({
    credentials: {
      issuerId: "issuer",
      keyId: "key",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    },
    now: new Date("2026-05-30T21:00:00Z"),
  });

  const [header, payload, signature] = jwt.split(".");
  assert.ok(header);
  assert.ok(payload);
  assert.ok(signature);
  assert.equal(JSON.parse(Buffer.from(header, "base64url").toString()).kid, "key");
  assert.equal(
    JSON.parse(Buffer.from(payload, "base64url").toString()).aud,
    "appstoreconnect-v1",
  );
});

test("monitor returns not_configured when credentials are absent", async () => {
  const result = await runIosBetaMonitor({
    appId: "6773488324",
    appStoreConnectUrl: "https://appstoreconnect.apple.com/apps/6773488324/testflight/ios",
    jwt: null,
    credentials: null,
    now: new Date("2026-05-30T21:00:00Z"),
  });

  assert.equal(result.status, "not_configured");
  assert.match(buildIosBetaMonitorDigest(result), /not_configured/);
});

test("monitor fetches latest build when a JWT is supplied", async () => {
  const result = await runIosBetaMonitor({
    appId: "6773488324",
    appStoreConnectUrl: "https://appstoreconnect.apple.com/apps/6773488324/testflight/ios",
    jwt: "jwt",
    credentials: null,
    now: new Date("2026-05-30T21:00:00Z"),
    fetchImpl: async (input, init) => {
      assert.match(String(input), /\/v1\/builds/);
      assert.match(String(input), /filter%5Bapp%5D=6773488324/);
      assert.equal(
        (init?.headers as Record<string, string>).authorization,
        "Bearer jwt",
      );
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "abc",
              attributes: {
                version: "41",
                processingState: "VALID",
                uploadedDate: "2026-05-30T21:00:00Z",
                expired: false,
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  assert.equal(result.status, "available");
  assert.match(result.message, /available in TestFlight/);
});

test("parses monitor args from HeyTelli environment", () => {
  const options = parseIosBetaMonitorArgs([], {
    HEYTELLI_APP_STORE_APP_ID: "123",
    APP_STORE_CONNECT_JWT: "jwt",
  });

  assert.equal(options.appId, "123");
  assert.equal(options.jwt, "jwt");
});
