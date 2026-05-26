import { getSharedPayloads } from "expo-sharing";

function parseIncomingPath(path: string) {
  try {
    return new URL(path);
  } catch {
    return new URL(path, "heytelli://app");
  }
}

export async function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    const url = parseIncomingPath(path);
    const isSharingIntent =
      url.hostname === "expo-sharing" ||
      url.pathname.includes("expo-sharing") ||
      path.includes("expo-sharing");

    if (!isSharingIntent) {
      return path;
    }

    let payloads: ReturnType<typeof getSharedPayloads> = [];
    try {
      payloads = getSharedPayloads();
    } catch {
      return "/add/shared";
    }

    const hasImage = payloads.some(
      (payload) =>
        payload.shareType === "image" ||
        payload.mimeType?.toLowerCase().startsWith("image/"),
    );

    return hasImage || payloads.length === 0 ? "/add/shared" : "/add";
  } catch {
    return "/";
  }
}
