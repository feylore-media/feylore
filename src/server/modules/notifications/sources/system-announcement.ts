import { PERMISSIONS } from "../../../../shared/permissions.js";
import { NOTIFICATION_TYPES } from "../../../../shared/notifications.js";
import type { DomainEvent } from "../events.js";
import type { NotificationDraft, NotificationSource } from "../sources.js";

export interface SystemAnnouncementPayload {
  title?: unknown;
  body?: unknown;
  /** "admins" (default) delivers to administrators; "users" delivers to all users. */
  target?: unknown;
}

/**
 * Renders the `system.announcement` domain event into per-user notifications.
 * An announcement is unique per publication, so the event id is used as the
 * dedupe key: republishing the same event never duplicates a delivered
 * announcement.
 */
export class SystemAnnouncementSource implements NotificationSource {
  readonly eventType = "system.announcement";

  resolve(event: DomainEvent): NotificationDraft[] {
    const payload = event.payload as SystemAnnouncementPayload;
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    if (!title) return [];
    const targetEveryone =
      payload.target === "users" || payload.target === "all";
    return [
      {
        recipient: targetEveryone
          ? { kind: "all" }
          : { kind: "permission", permission: PERMISSIONS.SYSTEM_SETTINGS_READ },
        type: NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
        title,
        body:
          typeof payload.body === "string" && payload.body.trim()
            ? payload.body.trim()
            : undefined,
        actorUserId: event.actorUserId,
        subjectType: "system",
        subjectId: event.id,
        dedupeKey: `system-announcement:${event.id}`,
      },
    ];
  }
}