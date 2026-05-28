import { requestUploadUrl } from "@workspace/api-client-react";

export type FeedbackAttachmentUploadInput = {
  uri: string;
  contentType?: string | null;
  size?: number | null;
};

export type FeedbackAttachment = {
  objectPath: string;
  contentType: string;
  size: number;
};

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

export async function uploadFeedbackAttachment({
  uri,
  contentType: inputContentType,
  size,
}: FeedbackAttachmentUploadInput): Promise<FeedbackAttachment> {
  const contentType = imageContentTypeForUri(uri, inputContentType);
  const ext = extensionForImageContentType(contentType);
  const name = `feedback-attachment-${Date.now()}.${ext}`;
  const fileRes = await fetch(uri);
  const blob = await fileRes.blob();
  const uploadedSize = blob.size || size || 1;

  const presigned = await requestUploadUrl({
    name,
    size: uploadedSize,
    contentType,
  });

  const putRes = await fetch(presigned.uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!putRes.ok) {
    throw new Error(`Attachment upload failed: ${putRes.status}`);
  }
  return {
    objectPath: presigned.objectPath,
    contentType,
    size: uploadedSize,
  };
}
