import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PassThrough, Readable } from "node:stream";
import { randomUUID } from "node:crypto";

import { entityIdToObjectPath, joinObjectKey } from "./paths";
import type {
  StoredObjectFile,
  StoredObjectMetadata,
  StoredObjectMetadataUpdate,
  UploadTarget,
} from "./types";

export type S3ObjectStorageConfig = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  privatePrefix: string;
  publicPrefixes: string[];
  forcePathStyle: boolean;
};

type UploadInput = {
  contentType?: string;
};

function firstEnv(env: NodeJS.ProcessEnv, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function parseBoolean(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes(value?.toLowerCase() ?? "");
}

export function readS3ObjectStorageConfig(
  env: NodeJS.ProcessEnv = process.env,
): S3ObjectStorageConfig | null {
  const endpoint = firstEnv(env, [
    "S3_ENDPOINT",
    "R2_ENDPOINT",
    "BUCKET_ENDPOINT",
    "ENDPOINT",
  ]);
  const bucket = firstEnv(env, [
    "S3_BUCKET",
    "R2_BUCKET",
    "BUCKET_NAME",
    "BUCKET",
  ]);
  const accessKeyId = firstEnv(env, [
    "S3_ACCESS_KEY_ID",
    "R2_ACCESS_KEY_ID",
    "BUCKET_ACCESS_KEY_ID",
    "ACCESS_KEY_ID",
  ]);
  const secretAccessKey = firstEnv(env, [
    "S3_SECRET_ACCESS_KEY",
    "R2_SECRET_ACCESS_KEY",
    "BUCKET_SECRET_ACCESS_KEY",
    "SECRET_ACCESS_KEY",
  ]);

  const anyS3Config = endpoint || bucket || accessKeyId || secretAccessKey;
  if (!anyS3Config) return null;

  const missing = [
    ["endpoint", endpoint],
    ["bucket", bucket],
    ["accessKeyId", accessKeyId],
    ["secretAccessKey", secretAccessKey],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Incomplete S3-compatible object storage config. Missing: ${missing.join(
        ", ",
      )}`,
    );
  }

  const publicPrefixes = (env.PUBLIC_OBJECT_SEARCH_PATHS ?? "")
    .split(",")
    .map((prefix) => prefix.trim())
    .filter(Boolean);

  return {
    endpoint: endpoint!,
    bucket: bucket!,
    region:
      firstEnv(env, ["S3_REGION", "R2_REGION", "BUCKET_REGION", "REGION"]) ??
      "auto",
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    privatePrefix:
      firstEnv(env, [
        "S3_PRIVATE_PREFIX",
        "R2_PRIVATE_PREFIX",
        "BUCKET_PRIVATE_PREFIX",
        "OBJECT_STORAGE_PRIVATE_PREFIX",
      ]) ?? "",
    publicPrefixes,
    forcePathStyle: parseBoolean(
      firstEnv(env, [
        "S3_FORCE_PATH_STYLE",
        "R2_FORCE_PATH_STYLE",
        "BUCKET_FORCE_PATH_STYLE",
      ]),
    ),
  };
}

export class S3ObjectStorageAdapter {
  private readonly client: S3Client;

  constructor(private readonly config: S3ObjectStorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
    });
  }

  async createUploadTarget(input: UploadInput = {}): Promise<UploadTarget> {
    const entityId = `uploads/${randomUUID()}`;
    const key = joinObjectKey(this.config.privatePrefix, entityId);
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: input.contentType,
    });

    return {
      uploadURL: await getSignedUrl(this.client, command, { expiresIn: 900 }),
      objectPath: entityIdToObjectPath(entityId),
    };
  }

  getObjectEntityFile(entityId: string): StoredObjectFile {
    return new S3StoredObjectFile(
      this.client,
      this.config.bucket,
      joinObjectKey(this.config.privatePrefix, entityId),
    );
  }

  getPublicObjectFile(prefix: string, filePath: string): StoredObjectFile {
    return new S3StoredObjectFile(
      this.client,
      this.config.bucket,
      joinObjectKey(prefix, filePath),
    );
  }

  getPublicPrefixes(): string[] {
    return this.config.publicPrefixes;
  }
}

class S3StoredObjectFile implements StoredObjectFile {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly key: string,
  ) {}

  get name(): string {
    return this.key;
  }

  async exists(): Promise<[boolean]> {
    try {
      await this.head();
      return [true];
    } catch (error) {
      if (isNotFoundError(error)) return [false];
      throw error;
    }
  }

  async getMetadata(): Promise<[StoredObjectMetadata]> {
    const head = await this.head();
    return [
      {
        contentType: head.ContentType,
        contentLength: head.ContentLength,
        size: head.ContentLength,
        metadata: head.Metadata,
      },
    ];
  }

  async download(): Promise<[Buffer]> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.key,
      }),
    );

    return [await bodyToBuffer(result.Body)];
  }

  createReadStream(): Readable {
    const passThrough = new PassThrough();
    void this.client
      .send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.key,
        }),
      )
      .then(async (result) => {
        const body = result.Body;
        if (isReadable(body)) {
          body.pipe(passThrough);
          return;
        }
        passThrough.end(await bodyToBuffer(body));
      })
      .catch((error: unknown) => {
        passThrough.destroy(error instanceof Error ? error : undefined);
      });
    return passThrough;
  }

  async setMetadata(update: StoredObjectMetadataUpdate): Promise<void> {
    const [metadata] = await this.getMetadata();
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: this.key,
        CopySource: encodeCopySource(this.bucket, this.key),
        MetadataDirective: "REPLACE",
        Metadata: update.metadata ?? {},
        ContentType: metadata.contentType,
      }),
    );
  }

  async delete(): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.key,
      }),
    );
  }

  private async head(): Promise<HeadObjectCommandOutput> {
    return this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: this.key,
      }),
    );
  }
}

function isNotFoundError(error: unknown): boolean {
  const maybeError = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    maybeError.name === "NotFound" ||
    maybeError.name === "NoSuchKey" ||
    maybeError.$metadata?.httpStatusCode === 404
  );
}

function isReadable(value: unknown): value is Readable {
  return (
    value instanceof Readable ||
    typeof (value as { pipe?: unknown })?.pipe === "function"
  );
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    return Buffer.alloc(0);
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (isReadable(body)) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  const transformToByteArray = (body as { transformToByteArray?: unknown })
    .transformToByteArray;
  if (typeof transformToByteArray === "function") {
    return Buffer.from(await transformToByteArray.call(body));
  }

  throw new Error("Unsupported S3 response body");
}

function encodeCopySource(bucket: string, key: string): string {
  return encodeURIComponent(`${bucket}/${key}`).replace(/%2F/g, "/");
}
