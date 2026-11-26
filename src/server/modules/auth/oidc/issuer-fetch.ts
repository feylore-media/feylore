import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class OidcIssuerFetchError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "OidcIssuerFetchError";
  }
}

function isPrivateIp(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "::1" || ip === "0.0.0.0") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;
  if (ip.startsWith("172.")) {
    const second = Number.parseInt(ip.split(".")[1] ?? "0", 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:"))
    return true;
  return false;
}

async function assertPublicIssuerUrl(url: URL): Promise<void> {
  if (url.protocol !== "https:") {
    throw new OidcIssuerFetchError("Only HTTPS URLs are allowed", "scheme");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new OidcIssuerFetchError("Blocked hostname", "hostname");
  }
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new OidcIssuerFetchError("Blocked IP range", "ip");
    }
    return;
  }
  const resolved = await lookup(hostname, { all: true });
  for (const entry of resolved) {
    if (isPrivateIp(entry.address)) {
      throw new OidcIssuerFetchError("Blocked resolved IP", "dns");
    }
  }
}

function assertSameOrigin(url: URL, issuerOrigin: string): void {
  if (url.origin !== issuerOrigin) {
    throw new OidcIssuerFetchError(
      "OIDC request escaped configured issuer origin",
      "origin",
    );
  }
}

export interface IssuerBoundFetchOptions {
  issuerOrigin: string;
  allowPrivateIssuer: boolean;
  timeoutMs?: number;
  method?: string;
  headers?: Record<string, string> | Headers;
  body?: string | URLSearchParams | null;
}

/**
 * Fetch restricted to the configured OIDC issuer origin.
 * Redirects that leave the issuer origin are rejected.
 */
export async function issuerBoundFetch(
  input: string | URL | Request,
  options: IssuerBoundFetchOptions,
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const initialUrl =
      input instanceof Request
        ? new URL(input.url)
        : input instanceof URL
          ? input
          : new URL(input);

    assertSameOrigin(initialUrl, options.issuerOrigin);

    if (!options.allowPrivateIssuer) {
      await assertPublicIssuerUrl(initialUrl);
    } else if (initialUrl.protocol !== "https:" && initialUrl.protocol !== "http:") {
      throw new OidcIssuerFetchError("Unsupported URL scheme", "scheme");
    }

    const response = await fetch(input, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      redirect: "manual",
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location?.trim()) {
        throw new OidcIssuerFetchError("Redirect without location", "redirect");
      }
      const nextUrl = new URL(location.trim(), initialUrl);
      assertSameOrigin(nextUrl, options.issuerOrigin);
      if (!options.allowPrivateIssuer) {
        await assertPublicIssuerUrl(nextUrl);
      }
      return issuerBoundFetch(nextUrl, {
        ...options,
      });
    }

    return response;
  } catch (err) {
    if (err instanceof OidcIssuerFetchError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new OidcIssuerFetchError("Request timed out", "timeout");
    }
    throw new OidcIssuerFetchError(
      err instanceof Error ? err.message : "Fetch failed",
      "fetch",
    );
  } finally {
    clearTimeout(timer);
  }
}

export function createIssuerBoundFetch(
  issuerOrigin: string,
  allowPrivateIssuer: boolean,
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return (input, init) =>
    issuerBoundFetch(input as string | URL | Request, {
      issuerOrigin,
      allowPrivateIssuer,
      method: init?.method,
      headers: init?.headers as Record<string, string> | Headers | undefined,
      body:
        typeof init?.body === "string" || init?.body instanceof URLSearchParams
          ? init.body
          : init?.body == null
            ? null
            : String(init.body),
    });
}
