import { and, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { JOB_TYPES } from "../jobs/types.js";
import type { NotificationType } from "../../../shared/notifications.js";

export interface NotificationChannelDispatch {
  userId: string;
  notificationId: string;
  type: NotificationType;
}

/**
 * Delivers a freshly-persisted notification row to an additional channel.
 * The NotificationService never knows about a specific channel; concrete
 * implementations own their gatekeeping (availability, per-user prefs).
 */
export interface NotificationChannelService {
  dispatch(input: NotificationChannelDispatch): Promise<void>;
}

/** Minimal async job sink so channels are testable without pg-boss. */
export interface JobSink {
  enqueue(
    type: string,
    payload?: Record<string, unknown>,
    options?: { singletonKey?: string },
  ): Promise<string>;
}

/**
 * Emails notifications asynchronously via pg-boss. A send is only enqueued
 * when the server has SMTP configured AND the recipient opted into email for
 * the type. Missing preference rows mean "never expressed": email stays off
 * (the conservative default).
 */
export class PgBossEmailChannel implements NotificationChannelService {
  constructor(
    private readonly db: Database,
    private readonly jobs: JobSink,
    private readonly isEmailAvailable: () => boolean,
  ) {}

  async dispatch(input: NotificationChannelDispatch): Promise<void> {
    if (!this.isEmailAvailable()) return;
    const rows = await this.db
      .select({ emailEnabled: schema.userNotificationPreferences.emailEnabled })
      .from(schema.userNotificationPreferences)
      .where(
        and(
          eq(schema.userNotificationPreferences.userId, input.userId),
          eq(schema.userNotificationPreferences.typeKey, input.type),
        ),
      )
      .limit(1);
    if (rows[0]?.emailEnabled !== true) return;
    await this.jobs.enqueue(JOB_TYPES.NOTIFICATION_EMAIL, {
      notificationId: input.notificationId,
    });
  }
}