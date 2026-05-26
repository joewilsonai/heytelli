const explicitBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const domain = process.env.EXPO_PUBLIC_DOMAIN;

export function getApiBaseUrl(): string | null {
  if (explicitBaseUrl) {
    return explicitBaseUrl.replace(/\/+$/, "");
  }

  if (!domain) {
    return null;
  }

  if (/^https?:\/\//i.test(domain)) {
    return domain.replace(/\/+$/, "");
  }

  return `https://${domain.replace(/\/+$/, "")}`;
}
