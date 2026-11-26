import { eq } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import * as schema from "../../../db/schema.js";
import type { JobService } from "../service.js";
import type { MailService } from "../../mail/service.js";
import { renderNotificationEmail } from "../../notifications/email-render.js";

export interface NotificationEmailPayload {
  notificationId: string;
  feyloreJobId: string;
}

/**
 * Reads the persisted notification and sends its rendered email. The row --
 * not the job payload -- is the source of truth for content, so stale
 * payloads can never leak stale text. No-op when SMTP is unconfigured or the
 * row/user is gone; failures are recorded on the job run and rethrown so
 * pg-boss can retry.
 */
export async function runNotificationEmail(
  jobService: JobService,
  db: Database,
  mail: MailService,
  appUrl: string,
  payload: NotificationEmailPayload,
): Promise<void> {
  const { notificationId, feyloreJobId } = payload;
  if (!mail.isConfigured()) return;

  try {
    const notification = await db.query.notifications.findFirst({
      where: eq(schema.notifications.id, notificationId),
    });
    if (!notification) {
      await jobService.updateStatus(feyloreJobId, "completed", {
        logExcerpt: `Skipped email: notification ${notificationId} no longer exists`,
      });
      return;
    }
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, notification.recipientUserId),
    });
    if (!user?.email) {
      await jobService.updateStatus(feyloreJobId, "completed", {
        logExcerpt: `Skipped email: recipient for notification ${notificationId} has no email`,
      });
      return;
    }

    await jobService.updateStatus(feyloreJobId, "running");
    const message = renderNotificationEmail({
      title: notification.title,
      body: notification.body,
      href: notification.href,
      appUrl,
    });
    await mail.send({ to: user.email, ...message });
    await jobService.updateStatus(feyloreJobId, "completed", {
      logExcerpt: `Emailed notification ${notificationId} to ${user.email}`,
    });
  } catch (err) {
    await jobService.updateStatus(feyloreJobId, "failed", {
      error: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}