import type { ResolvedSharePayload } from "expo-sharing";

export const MAX_SHARED_SCREENSHOTS = 5;

export type SharedImage = {
  uri: string;
  name: string;
  mimeType: string | null;
  size: number | null;
};

type ResolvedImagePayload = ResolvedSharePayload & {
  contentType: "image";
  contentUri: string;
};

function isResolvedImagePayload(
  payload: ResolvedSharePayload,
): payload is ResolvedImagePayload {
  return (
    payload.contentType === "image" &&
    typeof payload.contentUri === "string" &&
    payload.contentUri.length > 0
  );
}

export function getSharedImages(
  payloads: ResolvedSharePayload[],
): SharedImage[] {
  return payloads
    .filter(isResolvedImagePayload)
    .slice(0, MAX_SHARED_SCREENSHOTS)
    .map((payload, index) => ({
      uri: payload.contentUri,
      name: payload.originalName ?? `shared-screenshot-${index + 1}.jpg`,
      mimeType: payload.contentMimeType ?? null,
      size: payload.contentSize ?? null,
    }));
}

export function getSharedImageOverflowCount(
  payloads: ResolvedSharePayload[],
): number {
  return Math.max(
    0,
    payloads.filter(isResolvedImagePayload).length - MAX_SHARED_SCREENSHOTS,
  );
}
