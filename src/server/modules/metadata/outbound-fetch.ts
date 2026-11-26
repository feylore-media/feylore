import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_BUFFER_MAX_REDIRECTS = 5;

export interface OutboundFetchOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  /** Follow up to N HTTPS redirects, revalidating each hop. Default 0. */
  maxRedirects?: number;
}

export class OutboundFetchError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "OutboundFetchError";
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

export async function assertSafeUrl(urlString: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new OutboundFetchError("Invalid URL", "invalid_url");
  }
  if (url.protocol !== "https:") {
    throw new OutboundFetchError("Only HTTPS URLs are allowed", "scheme");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new OutboundFetchError("Blocked hostname", "hostname");
  }
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new OutboundFetchError("Blocked IP range", "ip");
    }
    return url;
  }
  const resolved = await lookup(hostname, { all: true });
  for (const entry of resolved) {
    if (isPrivateIp(entry.address)) {
      throw new OutboundFetchError("Blocked resolved IP", "dns");
    }
  }
  return url;
}

function redirectTarget(response: Response, currentUrl: URL): string {
  const location = response.headers.get("location");
  if (!location?.trim()) {
    throw new OutboundFetchError("Redirect without location", "redirect");
  }
  return new URL(location.trim(), currentUrl).toString();
}

async function outboundFetchResponse(
  urlString: string,
  options: OutboundFetchOptions = {},
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 0;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let currentUrl = urlString;
  let redirectsFollowed = 0;

  try {
    for (;;) {
      const url = await assertSafeUrl(currentUrl);
      const response = await fetch(url.toString(), {
        method: options.method ?? "GET",
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
        redirect: "manual",
      });

      if (response.status >= 300 && response.status < 400) {
        if (redirectsFollowed >= maxRedirects) {
          throw new OutboundFetchError(
            maxRedirects === 0
              ? "Redirects are not allowed"
              : "Too many redirects",
            "redirect",
          );
        }
        currentUrl = redirectTarget(response, url);
        redirectsFollowed++;
        continue;
      }

      return response;
    }
  } catch (err) {
    if (err instanceof OutboundFetchError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new OutboundFetchError("Request timed out", "timeout");
    }
    throw new OutboundFetchError(
      err instanceof Error ? err.message : "Fetch failed",
      "fetch",
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function outboundFetch(
  urlString: string,
  options: OutboundFetchOptions = {},
): Promise<{ status: number; body: string; headers: Headers }> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  try {
    const response = await outboundFetchResponse(urlString, options);
    const reader = response.body?.getReader();
    if (!reader) {
      return { status: response.status, body: "", headers: response.headers };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new OutboundFetchError("Response too large", "size");
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    return { status: response.status, body, headers: response.headers };
  } catch (err) {
    if (err instanceof OutboundFetchError) throw err;
    throw new OutboundFetchError(
      err instanceof Error ? err.message : "Fetch failed",
      "fetch",
    );
  }
}

export async function outboundFetchJson<T>(
  urlString: string,
  options: OutboundFetchOptions = {},
): Promise<T> {
  const { status, body } = await outboundFetch(urlString, options);
  if (status < 200 || status >= 300) {
    throw new OutboundFetchError(`HTTP ${status}`, "http");
  }
  return JSON.parse(body) as T;
}

export async function outboundFetchBuffer(
  urlString: string,
  options: Omit<OutboundFetchOptions, "body"> = {},
): Promise<{ data: Buffer; mediaType: string }> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_BUFFER_MAX_REDIRECTS;
  try {
    const response = await outboundFetchResponse(urlString, {
      ...options,
      maxRedirects,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new OutboundFetchError(`HTTP ${response.status}`, "http");
    }
    const reader = response.body?.getReader();
    if (!reader) {
      throw new OutboundFetchError("Empty response body", "empty");
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new OutboundFetchError("Response too large", "size");
      }
      chunks.push(value);
    }
    const data = Buffer.concat(chunks);
    const mediaType =
      response.headers.get("content-type")?.split(";")[0]?.trim() ??
      "application/octet-stream";
    return { data, mediaType };
  } catch (err) {
    if (err instanceof OutboundFetchError) throw err;
    throw new OutboundFetchError(
      err instanceof Error ? err.message : "Fetch failed",
      "fetch",
    );
  }
}
