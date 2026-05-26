import type { Readable } from "node:stream";

export type StoredObjectMetadata = {
  contentType?: string;
  contentLength?: number;
  size?: string | number;
  metadata?: Record<string, string | undefined>;
};

export type StoredObjectMetadataUpdate = {
  metadata?: Record<string, string>;
};

export type UploadTarget = {
  uploadURL: string;
  objectPath: string;
};

export interface StoredObjectFile {
  name: string;
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[StoredObjectMetadata]>;
  download(): Promise<[Buffer]>;
  createReadStream(): Readable;
  setMetadata(metadata: StoredObjectMetadataUpdate): Promise<void>;
  delete(): Promise<void>;
}
