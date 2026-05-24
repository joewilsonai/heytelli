import { requestUploadUrl } from "@workspace/api-client-react";

/**
 * Uploads a local image (from expo-image-picker) to object storage via the
 * server's presigned URL flow. Returns the object path to attach to a match.
 */
export async function uploadImage(uri: string): Promise<string> {
  const ext = uri.split(".").pop()?.toLowerCase() || "jpg";
  const contentType =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
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
