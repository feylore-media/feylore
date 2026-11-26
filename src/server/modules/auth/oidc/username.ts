import { eq } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import * as schema from "../../../db/schema.js";
import {
  sanitizeUsernameCandidate,
  USERNAME_MAX,
} from "../../../../shared/username.js";

export { sanitizeUsernameCandidate };

export function usernameCandidates(claims: {
  preferredUsername?: string;
  email?: string;
  subject: string;
}): string[] {
  const candidates: string[] = [];
  if (claims.preferredUsername) {
    candidates.push(sanitizeUsernameCandidate(claims.preferredUsername));
  }
  if (claims.email) {
    const local = claims.email.split("@")[0] ?? "";
    if (local) candidates.push(sanitizeUsernameCandidate(local));
  }
  candidates.push(sanitizeUsernameCandidate(`oidc-${claims.subject.slice(0, 8)}`));
  return [...new Set(candidates)];
}

export async function allocateUsername(
  db: Database,
  claims: {
    preferredUsername?: string;
    email?: string;
    subject: string;
  },
): Promise<string> {
  const bases = usernameCandidates(claims);
  for (const base of bases) {
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.username, base),
    });
    if (!existing) return base;
  }

  const fallback = bases[0] ?? "oidc-user";
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${fallback.slice(0, USERNAME_MAX - String(i).length - 1)}-${i}`;
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.username, candidate),
    });
    if (!existing) return candidate;
  }

  throw new Error("Unable to allocate unique username");
}
