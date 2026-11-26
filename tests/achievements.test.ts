import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { createPool, createDb } from "../src/server/db/client.js";
import * as schema from "../src/server/db/schema.js";
import { AchievementService } from "../src/server/modules/achievements/service.js";
import {
  createGoalAchievementGuard,
  createSystemAchievementGuard,
} from "../src/server/modules/achievements/source-guards.js";
import { SystemSettingsService } from "../src/server/modules/settings/system-service.js";
import { ActivityService } from "../src/server/modules/activity/service.js";
import {
  DomainEventBus,
  type DomainEvent,
} from "../src/server/modules/notifications/events.js";
import { GoalService } from "../src/server/modules/goals/service.js";
import { AchievementEarnedSource } from "../src/server/modules/notifications/sources/achievement-earned.js";
import { NOTIFICATION_TYPES } from "../src/shared/notifications.js";
import { ACTIVITY_TYPES } from "../src/shared/activity.js";
import {
  achievementDefineSchema,
  achievementGrantSnapshotSchema,
} from "../src/shared/achievements.js";
import { ensureTestUser } from "./helpers/test-user.js";
import { generateId } from "../src/server/security/crypto.js";
import { PERMISSIONS, type Permission } from "../src/shared/permissions.js";
import type { AuthUser } from "../src/server/modules/authorization/service.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../src/shared/errors.js";

const DATABASE_URL = process.env.DATABASE_URL;

function makeAuth(
  id: string,
  email: string,
  permissions: Permission[] = [],
): AuthUser {
  return {
    id,
    email,
    username: email.split("@")[0]!,
    displayName: "Test User",
    locale: "en",
    permissions: new Set(permissions),
    roleNames: [],
    sessionId: "test-session",
  };
}

describe("achievement contracts (no database)", () => {
  it("rejects definition keys outside the stable-key format", () => {
    expect(() =>
      achievementDefineSchema.parse({
        key: "Spooky Season",
        name: "Spooky Season",
        source: { type: "challenge", id: generateId() },
      }),
    ).toThrow();
    expect(
      achievementDefineSchema.parse({
        key: "spooky-season",
        name: "Spooky Season",
        source: { type: "challenge", id: generateId() },
      }),
    ).toMatchObject({ key: "spooky-season" });
  });

  it("requires a compact grant snapshot shape", () => {
    expect(
      achievementGrantSnapshotSchema.safeParse({
        achievement: { id: generateId(), key: "x", name: "X" },
        source: { type: "goal", id: generateId(), label: "Goal" },
      }).success,
    ).toBe(true);
    expect(
      achievementGrantSnapshotSchema.safeParse({
        achievement: { key: "x" },
        source: { type: "goal", id: generateId() },
      }).success,
    ).toBe(false);
  });

  it("renders achievement.earned without pre-rendered notification copy", () => {
    const source = new AchievementEarnedSource();
    const drafts = source.resolve({
      id: "evt-1",
      type: "achievement.earned",
      occurredAt: new Date().toISOString(),
      actorUserId: "actor-1",
      payload: {
        grantId: "grant-1",
        definitionId: "def-1",
        definitionKey: "completed",
        recipientUserId: "user-1",
        source: { type: "goal", id: "goal-1", label: "October Goal" },
        achievement: { name: "Spooky Season", icon: null },
      },
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      type: NOTIFICATION_TYPES.ACHIEVEMENT_EARNED,
      dedupeKey: "achievement-earned:grant-1",
    });
    expect(drafts[0]!.recipient).toEqual({
      kind: "users",
      userIds: ["user-1"],
    });
  });

  it("drops malformed achievement.earned events", () => {
    const source = new AchievementEarnedSource();
    expect(
      source.resolve({
        id: "evt-2",
        type: "achievement.earned",
        occurredAt: new Date().toISOString(),
        payload: { recipientUserId: "user-1" },
      }),
    ).toEqual([]);
  });
});

describe.skipIf(!DATABASE_URL)("achievements service", () => {
  const pool = createPool(DATABASE_URL!);
  const db = createDb(pool);
  const systemSettings = new SystemSettingsService(db);
  const activity = new ActivityService(db);
  const events = new DomainEventBus();
  const achievements = new AchievementService(db, systemSettings);
  const goals = new GoalService(db);

  const seenEvents: DomainEvent[] = [];
  const trackedUserIds = new Set<string>();
  let ownerId = "";
  let viewerId = "";
  let adminId = "";
  let owner: AuthUser;
  let viewer: AuthUser;
  let admin: AuthUser;

  const completionGoalInput = (title: string) => ({
    title,
    metric: "movies",
    aggregation: { kind: "count" as const },
    target: 1,
    domains: ["movies"],
    basis: "completed" as const,
  });

  async function freshUser(
    tag: string,
    permissions: Permission[] = [],
  ): Promise<{ id: string; auth: AuthUser }> {
    const email = `ach-${tag}-${generateId()}@example.com`;
    const id = await ensureTestUser(db, email);
    trackedUserIds.add(id);
    return { id, auth: makeAuth(id, email, permissions) };
  }

  async function seedCompletedMovie(userId: string) {
    await db.insert(schema.userProgress).values({
      id: generateId(),
      userId,
      subjectType: "movie",
      subjectId: generateId(),
      locatorJson: { completed: true },
    });
  }

  async function cleanupFor(userIds: string[]) {
    if (userIds.length === 0) return;
    await db
      .delete(schema.userAchievements)
      .where(inArray(schema.userAchievements.userId, userIds));
    await db
      .delete(schema.achievementDefinitions)
      .where(inArray(schema.achievementDefinitions.createdByUserId, userIds));
    await db
      .delete(schema.activityEvents)
      .where(inArray(schema.activityEvents.actorUserId, userIds));
    await db.delete(schema.goals).where(inArray(schema.goals.userId, userIds));
    await db
      .delete(schema.userProgress)
      .where(inArray(schema.userProgress.userId, userIds));
  }

  beforeAll(async () => {
    achievements.registerSourceGuard("system", createSystemAchievementGuard());
    achievements.registerSourceGuard("goal", createGoalAchievementGuard(db));
    achievements.setActivityService(activity);
    achievements.setDomainEvents(events);
    goals.setAchievementService(achievements);
    events.subscribe("achievement.earned", (event) => {
      seenEvents.push(event);
    });

    ownerId = await ensureTestUser(db, `ach-owner-${generateId()}@example.com`);
    viewerId = await ensureTestUser(
      db,
      `ach-viewer-${generateId()}@example.com`,
    );
    adminId = await ensureTestUser(db, `ach-admin-${generateId()}@example.com`);
    trackedUserIds.add(ownerId);
    trackedUserIds.add(viewerId);
    trackedUserIds.add(adminId);
    owner = makeAuth(ownerId, "owner@example.com", [PERMISSIONS.GOALS_WRITE]);
    viewer = makeAuth(viewerId, "viewer@example.com", [
      PERMISSIONS.GOALS_READ,
      PERMISSIONS.GOALS_WRITE,
    ]);
    admin = makeAuth(adminId, "admin@example.com", [
      PERMISSIONS.SYSTEM_SETTINGS_WRITE,
    ]);

    await cleanupFor([...trackedUserIds]);
    await systemSettings.setEnabledFeatureModules([
      "achievements",
      "challenges",
    ]);
  });

  afterAll(async () => {
    await cleanupFor([...trackedUserIds]);
    await systemSettings.setEnabledFeatureModules([
      "achievements",
      "challenges",
    ]);
    await pool.end();
  });

  it("defines a completion achievement when a goal is created", async () => {
    const goal = await goals.create(owner, completionGoalInput("Horror Dozen"));
    const defs = await achievements.getSourceAchievements("goal", goal.id);
    expect(defs).toHaveLength(1);
    expect(defs[0]).toMatchObject({
      key: "completed",
      name: "Horror Dozen",
      sourceType: "goal",
      sourceId: goal.id,
      sourceLabel: "Horror Dozen",
      state: "active",
    });
    await goals.delete(owner, goal.id);
  });

  it("enforces feature ownership on definition management", async () => {
    const goal = await goals.create(owner, completionGoalInput("Owned Goal"));
    await expect(
      achievements.defineAchievement(viewer, {
        key: "completed",
        name: "Hijack",
        source: { type: "goal", id: goal.id },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const [def] = await achievements.getSourceAchievements("goal", goal.id);
    await expect(
      achievements.updateAchievementDefinition(viewer, def!.id, {
        name: "Hijack",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      achievements.archiveAchievement(viewer, def!.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      achievements.defineAchievement(owner, {
        key: "completed",
        name: "Duplicate",
        source: { type: "goal", id: goal.id },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      achievements.defineAchievement(owner, {
        key: "custom",
        name: "Custom",
        source: { type: "nope", id: goal.id },
      }),
    ).rejects.toThrow();
    await goals.delete(owner, goal.id);
  });

  it("grants goal completion exactly once with provenance", async () => {
    const { id: earnerId, auth: earner } = await freshUser("earner", [
      PERMISSIONS.GOALS_WRITE,
    ]);
    const goal = await goals.create(
      earner,
      completionGoalInput("One Movie Wonder"),
    );
    await seedCompletedMovie(earnerId);

    // Evaluating a completed goal grants through the owning feature.
    const eventsBefore = seenEvents.length;
    const publicGoal = goals.toPublic(await goals.getGoal(goal.id));
    const progress = await goals.evaluateProgress(publicGoal);
    expect(progress.completed).toBe(true);
    expect(seenEvents.length).toBe(eventsBefore + 1);

    const [definition] = await achievements.getSourceAchievements(
      "goal",
      goal.id,
    );
    const stored = await achievements.getUserGrantForDefinition({
      viewer: earner,
      ownerId: earnerId,
      definitionId: definition!.id,
      viewerMaySeeProfile: true,
    });
    expect(stored).toMatchObject({
      definitionKey: "completed",
      name: "One Movie Wonder",
      sourceType: "goal",
      sourceId: goal.id,
      sourceLabel: "One Movie Wonder",
      reasonType: "goal.completed",
      reasonId: goal.id,
    });
    expect(stored!.snapshot).toMatchObject({
      achievement: { key: "completed", name: "One Movie Wonder" },
      source: { type: "goal", id: goal.id, label: "One Movie Wonder" },
    });
    const event = seenEvents[seenEvents.length - 1]!;
    expect(event.type).toBe("achievement.earned");
    expect(event.actorUserId).toBe(earnerId);
    expect(event.payload).toMatchObject({
      grantId: stored!.id,
      recipientUserId: earnerId,
      definitionKey: "completed",
    });
    // Structured context only — no pre-rendered notification copy.
    expect(event.payload).not.toHaveProperty("title");
    expect(event.payload).not.toHaveProperty("body");

    // Reprocessing the same completion event is a no-op.
    const again = await achievements.grantAchievement({
      source: { type: "goal", id: goal.id },
      definitionKey: "completed",
      recipientId: earnerId,
      reason: { type: "goal.completed", id: goal.id, label: goal.title },
      actorUserId: earnerId,
    });
    expect(again.created).toBe(false);
    expect(again.grant.id).toBe(stored!.id);
    expect(seenEvents.length).toBe(eventsBefore + 1);

    expect(await achievements.hasAchievement(earnerId, definition!.id)).toBe(
      true,
    );

    const rows = await db
      .select()
      .from(schema.userAchievements)
      .where(
        and(
          eq(schema.userAchievements.userId, earnerId),
          eq(schema.userAchievements.achievementDefinitionId, definition!.id),
        ),
      );
    expect(rows).toHaveLength(1);

    const activityRows = await db
      .select()
      .from(schema.activityEvents)
      .where(
        and(
          eq(schema.activityEvents.actorUserId, earnerId),
          eq(schema.activityEvents.type, ACTIVITY_TYPES.ACHIEVEMENT_EARNED),
        ),
      );
    expect(activityRows.length).toBeGreaterThanOrEqual(1);
    expect(activityRows[activityRows.length - 1]!.payload).toMatchObject({
      grantId: stored!.id,
      definitionKey: "completed",
    });

    await goals.delete(earner, goal.id);
  });

  it("keeps grants readable after the source is renamed and deleted", async () => {
    const { id: keeperId, auth: keeper } = await freshUser("keeper", [
      PERMISSIONS.GOALS_WRITE,
    ]);
    const goal = await goals.create(keeper, completionGoalInput("Rename Me"));
    await goals.update(keeper, goal.id, { title: "Renamed Goal" });
    const [def] = await achievements.getSourceAchievements("goal", goal.id);
    expect(def!.sourceLabel).toBe("Renamed Goal");

    const granted = await achievements.grantAchievement({
      source: { type: "goal", id: goal.id },
      definitionKey: "completed",
      recipientId: keeperId,
      reason: { type: "goal.completed", id: goal.id, label: "Renamed Goal" },
    });
    expect(granted.grant.sourceLabel).toBe("Renamed Goal");

    await goals.delete(keeper, goal.id);
    const archived = await achievements.getAchievement(
      granted.grant.definitionId,
    );
    expect(archived.state).toBe("archived");

    // Archived definitions stop granting but existing grants survive.
    await expect(
      achievements.grantAchievement({
        source: { type: "goal", id: goal.id },
        definitionKey: "completed",
        recipientId: viewerId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const mine = await achievements.getUserGrantForDefinition({
      viewer: keeper,
      ownerId: keeperId,
      definitionId: granted.grant.definitionId,
      viewerMaySeeProfile: true,
    });
    expect(mine).toMatchObject({
      id: granted.grant.id,
      sourceLabel: "Renamed Goal",
    });
    expect(mine!.snapshot).toMatchObject({
      source: { type: "goal", id: goal.id, label: "Renamed Goal" },
    });
  });

  it("filters grants by source visibility for other viewers", async () => {
    const { id: privateOwnerId, auth: privateOwner } = await freshUser(
      "private-owner",
      [PERMISSIONS.GOALS_WRITE],
    );
    const privateGoal = await goals.create(privateOwner, {
      ...completionGoalInput("Private Goal"),
      visibility: "private",
    });
    const privateGrant = await achievements.grantAchievement({
      source: { type: "goal", id: privateGoal.id },
      definitionKey: "completed",
      recipientId: privateOwnerId,
      reason: { type: "goal.completed", id: privateGoal.id },
    });
    const context = {
      viewer,
      ownerId: privateOwnerId,
      viewerMaySeeProfile: true as const,
    };
    // A viewer who cannot see the private goal learns nothing about the grant.
    expect(
      await achievements.getUserGrantForDefinition({
        ...context,
        definitionId: privateGrant.grant.definitionId,
      }),
    ).toBeNull();
    expect(await achievements.countUserGrants(context)).toBe(0);
    expect((await achievements.listUserGrants(context)).total).toBe(0);
    expect(await achievements.recentUserGrants(context)).toEqual([]);

    // The owner always sees their own grants.
    expect(
      await achievements.getUserGrantForDefinition({
        viewer: privateOwner,
        ownerId: privateOwnerId,
        definitionId: privateGrant.grant.definitionId,
        viewerMaySeeProfile: true,
      }),
    ).not.toBeNull();

    // Public goal grants are visible to viewers with goals read access.
    await goals.update(privateOwner, privateGoal.id, { visibility: "public" });
    expect(
      await achievements.getUserGrantForDefinition({
        ...context,
        definitionId: privateGrant.grant.definitionId,
      }),
    ).not.toBeNull();
    expect(await achievements.countUserGrants(context)).toBe(1);

    // Profile gate still applies before source filtering.
    await expect(
      achievements.countUserGrants({
        viewer,
        ownerId: privateOwnerId,
        viewerMaySeeProfile: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await goals.delete(privateOwner, privateGoal.id);
  });

  it("paginates earned achievements", async () => {
    const { id: collectorId, auth: collector } = await freshUser("collector");
    for (const name of ["First Win", "Second Win", "Third Win"]) {
      const def = await achievements.defineAchievement(admin, {
        key: name.toLowerCase().replace(/ /g, "-"),
        name,
        source: { type: "system", id: "pagination" },
      });
      await achievements.grantAchievement({
        source: { type: "system", id: "pagination" },
        definitionKey: def.key,
        recipientId: collectorId,
      });
    }
    const context = {
      viewer: collector,
      ownerId: collectorId,
      viewerMaySeeProfile: true as const,
    };
    expect(await achievements.countUserGrants(context)).toBe(3);
    const pageOne = await achievements.listUserGrants({
      ...context,
      limit: 2,
      offset: 0,
    });
    expect(pageOne.total).toBe(3);
    expect(pageOne.items).toHaveLength(2);
    const pageTwo = await achievements.listUserGrants({
      ...context,
      limit: 2,
      offset: 2,
    });
    expect(pageTwo.items).toHaveLength(1);
    expect(pageTwo.items[0]!.id).not.toBe(pageOne.items[0]!.id);
    const recent = await achievements.recentUserGrants({
      ...context,
      limit: 2,
    });
    expect(recent).toHaveLength(2);
    expect(recent[0]!.name).toBe("Third Win");
  });

  it("restricts the system source to administrators", async () => {
    await expect(
      achievements.defineAchievement(owner, {
        key: "sys-one",
        name: "Sys One",
        source: { type: "system", id: "core" },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const def = await achievements.defineAchievement(admin, {
      key: "sys-one",
      name: "Sys One",
      source: { type: "system", id: "core" },
    });
    expect(def.createdByUserId).toBe(adminId);
    const restored = await achievements.archiveAchievement(admin, def.id);
    expect(restored.state).toBe("archived");
    const active = await achievements.restoreAchievement(admin, def.id);
    expect(active.state).toBe("active");
  });

  it("stops processing when the module is disabled, keeping stored data", async () => {
    const { id: toggledId } = await freshUser("toggled");
    const { id: toggledViewerId } = await freshUser("toggled-viewer");
    const def = await achievements.defineAchievement(admin, {
      key: "toggle-check",
      name: "Toggle Check",
      source: { type: "system", id: "core" },
    });
    await achievements.grantAchievement({
      source: { type: "system", id: "core" },
      definitionKey: "toggle-check",
      recipientId: toggledId,
    });
    expect(await achievements.isEnabled()).toBe(true);

    await systemSettings.setEnabledFeatureModules(["challenges"]);
    expect(await achievements.isEnabled()).toBe(false);
    await expect(
      achievements.defineAchievement(admin, {
        key: "toggle-blocked",
        name: "Toggle Blocked",
        source: { type: "system", id: "core" },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      achievements.grantAchievement({
        source: { type: "system", id: "core" },
        definitionKey: "toggle-check",
        recipientId: toggledId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Stored grants and definitions survive; re-enabling restores the module.
    const stillThere = await achievements.getAchievement(def.id);
    expect(stillThere.state).toBe("active");
    expect(await achievements.hasAchievement(toggledId, def.id)).toBe(true);

    await systemSettings.setEnabledFeatureModules([
      "achievements",
      "challenges",
    ]);
    expect(await achievements.isEnabled()).toBe(true);
    const resumed = await achievements.grantAchievement({
      source: { type: "system", id: "core" },
      definitionKey: "toggle-check",
      recipientId: toggledViewerId,
    });
    expect(resumed.created).toBe(true);
  });
});
