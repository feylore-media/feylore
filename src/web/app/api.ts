import type { ProfileCosmetics } from "@shared/profile-platform";

const API_BASE = "/api/v1";

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const hasBody = options.body != null && options.body !== "";
  const headers: Record<string, string> = isFormData
    ? { ...(options.headers as Record<string, string> | undefined) }
    : {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(options.headers as Record<string, string> | undefined),
      };

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers,
    ...options,
  });

  const contentType = res.headers.get("content-type") ?? "";
  const json =
    contentType.includes("application/json")
      ? await res.json()
      : { error: { message: await res.text() } };

  if (!res.ok) {
    throw new Error(json.error?.message ?? "Request failed");
  }
  return json as T;
}

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  locale?: string;
  theme?: "light" | "dark" | "system";
  permissions: string[];
  roleNames: string[];
  hasPassword?: boolean;
}

export interface SelfUserProfile {
  username: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string | null;
  profileVisibility: "public" | "members" | "private";
  isOwner?: boolean;
  email: string;
  locale: string;
  profileJson: Record<string, unknown>;
  cosmetics?: ProfileCosmetics | null;
}

export async function fetchMe(): Promise<{
  data: { user: User | null; profile?: SelfUserProfile | null };
}> {
  return api("/auth/me");
}

export async function fetchSelfProfile(): Promise<{ data: SelfUserProfile }> {
  return api("/auth/me/profile");
}

export async function fetchSetupRequired(): Promise<{
  data: { required: boolean };
}> {
  return api("/auth/setup-required");
}
