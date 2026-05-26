import { Storage, type File } from "@google-cloud/storage";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";
import { entityIdToObjectPath, objectPathToEntityId } from "./storage/paths";
import {
  S3ObjectStorageAdapter,
  readS3ObjectStorageConfig,
} from "./storage/s3Adapter";
import type {
  StoredObjectFile,
  StoredObjectMetadata,
  UploadTarget,
} from "./storage/types";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  private readonly s3Adapter: S3ObjectStorageAdapter | null;

  constructor() {
    const s3Config = readS3ObjectStorageConfig();
    this.s3Adapter = s3Config ? new S3ObjectStorageAdapter(s3Config) : null;
  }

  getPublicObjectSearchPaths(): Array<string> {
    if (this.s3Adapter) {
      const paths = this.s3Adapter.getPublicPrefixes();
      if (paths.length === 0) {
        throw new Error("PUBLIC_OBJECT_SEARCH_PATHS not set.");
      }
      return paths;
    }

    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0),
      ),
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths).",
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var.",
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<StoredObjectFile | null> {
    if (this.s3Adapter) {
      for (const prefix of this.getPublicObjectSearchPaths()) {
        const file = this.s3Adapter.getPublicObjectFile(prefix, filePath);
        const [exists] = await file.exists();
        if (exists) {
          return file;
        }
      }
      return null;
    }

    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        return new GcsStoredObjectFile(file);
      }
    }

    return null;
  }

  async downloadObject(
    file: StoredObjectFile,
    cacheTtlSec: number = 3600,
  ): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const contentLength = metadata.contentLength ?? metadata.size;
    const headers: Record<string, string> = {
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (contentLength) {
      headers["Content-Length"] = String(contentLength);
    }

    return new Response(webStream, { headers });
  }

  async createObjectEntityUploadTarget(input: {
    contentType?: string;
  }): Promise<UploadTarget> {
    if (this.s3Adapter) {
      return this.s3Adapter.createUploadTarget(input);
    }

    const uploadURL = await this.getObjectEntityUploadURL();
    return {
      uploadURL,
      objectPath: this.normalizeObjectEntityPath(uploadURL),
    };
  }

  async getObjectEntityUploadURL(): Promise<string> {
    if (this.s3Adapter) {
      const target = await this.s3Adapter.createUploadTarget();
      return target.uploadURL;
    }

    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var.",
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<StoredObjectFile> {
    const entityId = objectPathToEntityId(objectPath);
    if (!entityId) {
      throw new ObjectNotFoundError();
    }

    if (this.s3Adapter) {
      const objectFile = this.s3Adapter.getObjectEntityFile(entityId);
      const [exists] = await objectFile.exists();
      if (!exists) {
        throw new ObjectNotFoundError();
      }
      return objectFile;
    }

    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return new GcsStoredObjectFile(objectFile);
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.startsWith("/objects/")) {
      const entityId = objectPathToEntityId(rawPath);
      if (!entityId) {
        throw new ObjectNotFoundError();
      }
      return entityIdToObjectPath(entityId);
    }

    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return entityIdToObjectPath(entityId);
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: StoredObjectFile;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

class GcsStoredObjectFile implements StoredObjectFile {
  constructor(private readonly file: File) {}

  get name(): string {
    return this.file.name;
  }

  exists(): Promise<[boolean]> {
    return this.file.exists();
  }

  async getMetadata(): Promise<[StoredObjectMetadata]> {
    const [metadata] = await this.file.getMetadata();
    const rawSize = metadata.size;
    const numericSize =
      typeof rawSize === "number"
        ? rawSize
        : typeof rawSize === "string"
          ? Number(rawSize)
          : undefined;

    return [
      {
        contentType:
          typeof metadata.contentType === "string"
            ? metadata.contentType
            : undefined,
        contentLength:
          typeof numericSize === "number" && !Number.isNaN(numericSize)
            ? numericSize
            : undefined,
        size: rawSize,
        metadata: metadata.metadata as Record<string, string | undefined>,
      },
    ];
  }

  download(): Promise<[Buffer]> {
    return this.file.download();
  }

  createReadStream(): Readable {
    return this.file.createReadStream();
  }

  async setMetadata(metadata: {
    metadata?: Record<string, string>;
  }): Promise<void> {
    await this.file.setMetadata(metadata);
  }

  async delete(): Promise<void> {
    await this.file.delete();
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`,
    );
  }

  const json = (await response.json()) as { signed_url: string };
  return json.signed_url;
}
