import { useEffect, useState } from "react";
import { getStoredToken, resolveApiUrl } from "./auth";
import { objectPathToUrl } from "./upload";

export function useObjectImageUrl(objectPath: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const storagePath = objectPathToUrl(objectPath);

    setUrl(null);
    if (!storagePath) return undefined;

    if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
      setUrl(storagePath);
      return undefined;
    }
    const resolvedStoragePath = storagePath;

    async function load(): Promise<void> {
      try {
        const token = getStoredToken();
        const response = await fetch(resolveApiUrl(resolvedStoragePath), {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!response.ok) return;
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setUrl(null);
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectPath]);

  return url;
}
