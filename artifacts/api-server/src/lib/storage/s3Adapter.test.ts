import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readS3ObjectStorageConfig } from "./s3Adapter";

describe("S3 object storage config", () => {
  it("stays disabled when no S3-compatible storage env is present", () => {
    assert.equal(readS3ObjectStorageConfig({}), null);
  });

  it("reads explicit S3 env vars", () => {
    const config = readS3ObjectStorageConfig({
      S3_ENDPOINT: "https://storage.example.com",
      S3_BUCKET: "heytelli",
      S3_REGION: "auto",
      S3_ACCESS_KEY_ID: "key",
      S3_SECRET_ACCESS_KEY: "secret",
      S3_PRIVATE_PREFIX: "private",
      S3_FORCE_PATH_STYLE: "true",
    });

    assert.deepEqual(config, {
      endpoint: "https://storage.example.com",
      bucket: "heytelli",
      region: "auto",
      accessKeyId: "key",
      secretAccessKey: "secret",
      privatePrefix: "private",
      publicPrefixes: [],
      forcePathStyle: true,
    });
  });

  it("reads Cloudflare R2-style env vars", () => {
    const config = readS3ObjectStorageConfig({
      R2_ENDPOINT: "https://account.r2.cloudflarestorage.com",
      R2_BUCKET: "heytelli",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
    });

    assert.equal(config?.region, "auto");
    assert.equal(config?.bucket, "heytelli");
    assert.equal(config?.forcePathStyle, false);
  });

  it("reads Railway Bucket variable names", () => {
    const config = readS3ObjectStorageConfig({
      ENDPOINT: "https://storage.railway.app",
      BUCKET: "heytelli-abcd",
      REGION: "us-east-1",
      ACCESS_KEY_ID: "key",
      SECRET_ACCESS_KEY: "secret",
      PUBLIC_OBJECT_SEARCH_PATHS: "public, assets",
    });

    assert.equal(config?.endpoint, "https://storage.railway.app");
    assert.equal(config?.bucket, "heytelli-abcd");
    assert.equal(config?.region, "us-east-1");
    assert.deepEqual(config?.publicPrefixes, ["public", "assets"]);
  });

  it("throws when partial S3-compatible storage env is present", () => {
    assert.throws(
      () =>
        readS3ObjectStorageConfig({
          S3_ENDPOINT: "https://storage.example.com",
        }),
      /Missing: bucket, accessKeyId, secretAccessKey/,
    );
  });
});
