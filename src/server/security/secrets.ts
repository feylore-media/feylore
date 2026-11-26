import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, "feylore-config-v1", KEY_LENGTH);
}

export function encryptConfig(
  secret: string,
  data: Record<string, unknown>,
): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptConfig(
  secret: string,
  encryptedBase64: string,
): Record<string, unknown> {
  const key = deriveKey(secret);
  const buf = Buffer.from(encryptedBase64, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(decrypted) as Record<string, unknown>;
}

export function getConfigEncryptionSecret(
  sessionSecret: string,
  configEncryptionKey?: string,
): string {
  return configEncryptionKey ?? sessionSecret;
}

/** Returns config schema keys that are secrets (never expose values). */
export function maskConfigForResponse(
  configSchema: Array<{ key: string; type: string }> | undefined,
  hasConfig: boolean,
): Record<string, unknown> | undefined {
  if (!hasConfig || !configSchema?.length) return undefined;
  const masked: Record<string, unknown> = {};
  for (const field of configSchema) {
    if (field.type === "secret") {
      masked[field.key] = "[configured]";
    }
  }
  return Object.keys(masked).length > 0 ? masked : undefined;
}
