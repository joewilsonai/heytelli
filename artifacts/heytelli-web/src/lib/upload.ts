import {
  requestUploadUrl,
  type UploadUrlRequest,
} from "@workspace/api-client-react";

export interface UploadFileLike {
  name: string;
  size: number;
  type: string;
}

export function buildUploadRequest(file: UploadFileLike): UploadUrlRequest {
  const contentType = file.type || "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    throw new Error("Choose an image screenshot to upload.");
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error("The selected image is empty.");
  }
  return {
    name: file.name || "screenshot",
    size: file.size,
    contentType,
  };
}

export async function uploadImageFile(file: File): Promise<string> {
  const target = await requestUploadUrl(buildUploadRequest(file));
  const response = await fetch(target.uploadURL, {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
  });

  if (!response.ok) {
    throw new Error(`Upload failed with HTTP ${response.status}`);
  }

  return target.objectPath;
}

export function objectPathToUrl(objectPath: string | null | undefined): string | null {
  if (!objectPath) return null;
  if (objectPath.startsWith("http://") || objectPath.startsWith("https://")) {
    return objectPath;
  }
  const normalized = objectPath.replace(/^\/?objects\//, "/objects/");
  const path = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `/api/storage${path}`;
}
