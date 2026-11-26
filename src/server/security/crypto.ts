import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { uuidv7 } from "uuidv7";

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string, secret: string): string {
  return createHash("sha256").update(`${secret}:${token}`).digest("hex");
}

export function hashResetToken(token: string, secret: string): string {
  return createHash("sha256")
    .update(`reset:${secret}:${token}`)
    .digest("hex");
}

export function verifySessionToken(
  token: string,
  hash: string,
  secret: string,
): boolean {
  const computed = hashSessionToken(token, secret);
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
  } catch {
    return false;
  }
}

export function generateId(): string {
  return uuidv7();
}
