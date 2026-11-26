import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createPool, createDb } from "../src/server/db/client.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/server/db/schema.js";
import { seed } from "../src/server/db/seed.js";
import { generateId } from "../src/server/security/crypto.js";
import { NOTIFICATION_TYPES } from "../src/shared/notifications.js";
import {
  PgBossEmailChannel,
  type JobSink,
} from "../src/server/modules/notifications/channels.js";
import { renderNotificationEmail } from "../src/server/modules/notifications/email-render.js";
import { runNotificationEmail } from "../src/server/modules/jobs/handlers/notification-email.js";
import { JOB_TYPES } from "../src/server/modules/jobs/types.js";
import type { JobService } from "../src/server/modules/jobs/service.js";
import type { MailService } from "../src/server/modules/mail/service.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://feylore:feylore@localhost:5432/feylore_test";

const dbAvailable = await (async () => {
  try {
    const pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await pool.end();
    return true;
  } catch {
    return false;
  }
})();

describe("Notification email renderer", () => {
  it("renders a subject, text and html with a resolved internal link", () => {
    const message = renderNotificationEmail({
      title: "You were mentioned",
      body: "In <Club A>",
      href: "/clubs/c1",
      appUrl: "https://library.example/",
    });
    expect(message.subject).toBe("Feylore: You were mentioned");
    expect(message.text).toContain("You were mentioned");
    expect(message.text).toContain("In <Club A>");
    expect(message.text).toContain("https://library.example/clubs/c1");
    expect(message.html).toContain("In &lt;Club A&gt;");
    expect(message.html).toContain("https://library.example/clubs/c1");
  });

  it("omits links when href is missing or not root-relative", () => {
    const noHref = renderNotificationEmail({
      title: "T",
      body: "B",
      href: null,
      appUrl: "https://library.example/",
    });
    expect(noHref.text).not.toContain("library.example");
    const absolute = renderNotificationEmail({
      title: "T",
      body: "B",
      href: "https://evil.example/x",
      appUrl: "https://library.example/",
    });
    expect(absolute.text).not.toContain("evil.example");
  });
});

describe.skipIf(!dbAvailable)("PgBossEmailChannel", () => {
  let pool: Awaited<ReturnType<typeof createPool>>;
  let db: ReturnType<typeof createDb>;
  let userId = "";

  beforeAll(async () => {
    pool = createPool(DATABASE_URL);
    db = createDb(pool);
    await seed(db);
    userId = generateId();
    await db.insert(schema.users).values({
      id: userId,
      email: `notif-email-${generateId().toLowerCase()}@test.local`,
      username: "notifemail",
      displayName: "Notif Email",
      passwordHash: "x",
    });
  });

  afterAll(async () => {
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  function makeJobs() {
    const enqueued: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const jobs: JobSink = {
      async enqueue(type, payload = {}) {
        enqueued.push({ type, payload });
        return "boss-job";
      },
    };
    return { enqueued, jobs };
  }

  it.skipIf(!dbAvailable)("enqueues an email job when opted in and available", async () => {
    await db
      .insert(schema.userNotificationPreferences)
      .values({
        userId,
        typeKey: NOTIFICATION_TYPES.CLUB_MENTION,
        emailEnabled: true,
      })
      .onConflictDoUpdate({
        target: [
          schema.userNotificationPreferences.userId,
          schema.userNotificationPreferences.typeKey,
        ],
        set: { emailEnabled: true },
      });
    const { enqueued, jobs } = makeJobs();
    const channel = new PgBossEmailChannel(db, jobs, () => true);
    await channel.dispatch({
      userId,
      notificationId: generateId(),
      type: NOTIFICATION_TYPES.CLUB_MENTION,
    });
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.type).toBe(JOB_TYPES.NOTIFICATION_EMAIL);
    expect(enqueued[0]!.payload.notificationId).toBeTypeOf("string");
  });

  it.skipIf(!dbAvailable)("does not enqueue when the user opted out of email", async () => {
    await db
      .insert(schema.userNotificationPreferences)
      .values({
        userId,
        typeKey: NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
        emailEnabled: false,
      })
      .onConflictDoUpdate({
        target: [
          schema.userNotificationPreferences.userId,
          schema.userNotificationPreferences.typeKey,
        ],
        set: { emailEnabled: false },
      });
    const { enqueued, jobs } = makeJobs();
    const channel = new PgBossEmailChannel(db, jobs, () => true);
    await channel.dispatch({
      userId,
      notificationId: generateId(),
      type: NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
    });
    expect(enqueued).toHaveLength(0);
  });

  it.skipIf(!dbAvailable)("does not enqueue when email is unavailable", async () => {
    const { enqueued, jobs } = makeJobs();
    const channel = new PgBossEmailChannel(db, jobs, () => false);
    await channel.dispatch({
      userId,
      notificationId: generateId(),
      type: NOTIFICATION_TYPES.CLUB_MENTION,
    });
    expect(enqueued).toHaveLength(0);
  });
});

describe.skipIf(!dbAvailable)("runNotificationEmail", () => {
  let pool: Awaited<ReturnType<typeof createPool>>;
  let db: ReturnType<typeof createDb>;
  let userId = "";
  let email = "";

  beforeAll(async () => {
    pool = createPool(DATABASE_URL);
    db = createDb(pool);
    await seed(db);
    email = `notif-send-${generateId().toLowerCase()}@test.local`;
    userId = generateId();
    await db.insert(schema.users).values({
      id: userId,
      email,
      username: "notifsend",
      displayName: "Notif Send",
      passwordHash: "x",
    });
  });

  afterAll(async () => {
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  function makeMail() {
    const sent: Array<{ to: string; subject: string }> = [];
    const mail = {
      isConfigured: () => true,
      async send(input: { to: string; subject: string; text: string; html: string }) {
        sent.push({ to: input.to, subject: input.subject });
      },
    } as unknown as MailService;
    return { sent, mail };
  }

  function makeJobService() {
    const statuses: Array<{ id: string; status: string }> = [];
    const jobService = {
      async updateStatus(id: string, status: string) {
        statuses.push({ id, status });
      },
    } as unknown as JobService;
    return { statuses, jobService };
  }

  it.skipIf(!dbAvailable)("sends the rendered email and completes the job", async () => {
    const notificationId = generateId();
    await db.insert(schema.notifications).values({
      id: notificationId,
      recipientUserId: userId,
      type: NOTIFICATION_TYPES.CLUB_MENTION,
      title: "Mentioned",
      body: "Hello",
      href: "/clubs/c1",
      payload: {},
      aggregatedCount: 1,
    });
    const { sent, mail } = makeMail();
    const { statuses, jobService } = makeJobService();
    await runNotificationEmail(jobService, db, mail, "https://library.example", {
      notificationId,
      feyloreJobId: "job-1",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(email);
    expect(sent[0]!.subject).toBe("Feylore: Mentioned");
    expect(statuses.map((s) => s.status)).toEqual([
      "running",
      "completed",
    ]);
  });

  it.skipIf(!dbAvailable)("skips cleanly when the notification is gone", async () => {
    const { sent, mail } = makeMail();
    const { statuses, jobService } = makeJobService();
    await runNotificationEmail(jobService, db, mail, "https://library.example", {
      notificationId: generateId(),
      feyloreJobId: "job-2",
    });
    expect(sent).toHaveLength(0);
    expect(statuses.map((s) => s.status)).toEqual(["completed"]);
  });

  it.skipIf(!dbAvailable)("does nothing without SMTP configured", async () => {
    const notificationId = generateId();
    await db.insert(schema.notifications).values({
      id: notificationId,
      recipientUserId: userId,
      type: NOTIFICATION_TYPES.CLUB_MENTION,
      title: "Mentioned",
      body: null,
      href: null,
      payload: {},
      aggregatedCount: 1,
    });
    const statuses: Array<{ id: string; status: string }> = [];
    const jobService = {
      async updateStatus(id: string, status: string) {
        statuses.push({ id, status });
      },
    } as unknown as JobService;
    const mail = { isConfigured: () => false } as unknown as MailService;
    await runNotificationEmail(jobService, db, mail, "https://library.example", {
      notificationId,
      feyloreJobId: "job-3",
    });
    expect(statuses).toHaveLength(0);
  });
});