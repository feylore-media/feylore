import { generateId } from "../../security/crypto.js";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";

export class AuditService {
  constructor(private readonly db: Database) {}

  async log(
    actorUserId: string | null,
    type: string,
    payload?: Record<string, unknown>,
    ipAddress?: string,
    resourceType?: string,
    resourceId?: string,
  ) {
    await this.db.insert(schema.auditEvents).values({
      id: generateId(),
      actorUserId: actorUserId ?? undefined,
      type,
      resourceType,
      resourceId,
      ipAddress,
      payload,
    });
  }
}
