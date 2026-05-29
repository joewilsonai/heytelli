import { requestUploadUrl } from "@workspace/api-client-react";

function imageContentTypeForUri(
  uri: string,
  contentType?: string | null,
): string {
  const normalized = contentType?.toLowerCase();
  if (normalized?.startsWith("image/")) return normalized;
  const ext = uri.split(".").pop()?.toLowerCase().split("?")[0] || "jpg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  return "image/jpeg";
}

function extensionForImageContentType(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/heic") return "heic";
  if (contentType === "image/heif") return "heif";
  return "jpg";
}

/**
 * Uploads a local image (from expo-image-picker) to object storage via the
 * server's presigned URL flow. Returns the object path to attach to a match.
 */
export async function uploadImage(uri: string): Promise<string> {
  const contentType = imageContentTypeForUri(uri);
  const ext = extensionForImageContentType(contentType);
  const name = `screenshot-${Date.now()}.${ext}`;

  // Fetch the local file into a blob (works in Expo Go RN runtime)
  const fileRes = await fetch(uri);
  const blob = await fileRes.blob();

  const presigned = await requestUploadUrl({
    name,
    size: blob.size || 1,
    contentType,
  });

  const putRes = await fetch(presigned.uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed: ${putRes.status}`);
  }
  return presigned.objectPath;
}
