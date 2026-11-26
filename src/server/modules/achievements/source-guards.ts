import { and, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import type { AuthUser } from "../authorization/service.js";
import { PERMISSIONS } from "../../../shared/permissions.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors.js";

/**
 * Feature-owned source guard. Each source type (goal, club, challenge,
 * system) registers one so the AchievementService can enforce ownership and
 * source visibility without knowing feature internals.
 */
export interface AchievementSourceGuard {
  /**
   * Throw ForbiddenError/NotFoundError unless actor may define/manage/grant
   * achievements for this source. Grants flow through the owning feature's
   * issuance rules; this hook enforces feature ownership on definition
   * management and on future grant surfaces.
   */
  assertCanManage(actor: AuthUser, sourceId: string): Promise<void>;
  /** Current human-readable label of the source, or null when it is gone. */
  resolveSourceLabel(sourceId: string): Promise<string | null>;
  /**
   * True when the viewer may learn about this source's existence. Backs the
   * grant query/presentation layer so (for example) a Club achievement never
   * exposes membership in a private Club to someone who cannot see that Club.
   */
  canViewerSeeSource(viewer: AuthUser, sourceId: string): Promise<boolean>;
}

export class UnknownAchievementSourceError extends ValidationError {
  constructor(sourceType: string) {
    super(`Unknown achievement source type "${sourceType}"`);
  }
}

function requireGoalRow(
  row: typeof schema.goals.$inferSelect | undefined,
): typeof schema.goals.$inferSelect {
  if (!row) throw new NotFoundError("Goal not found");
  return row;
}

/** System achievements originate from Feylore itself (administered). */
export function createSystemAchievementGuard(): AchievementSourceGuard {
  return {
    async assertCanManage(actor: AuthUser) {
      if (!actor.permissions.has(PERMISSIONS.SYSTEM_SETTINGS_WRITE)) {
        throw new ForbiddenError();
      }
    },
    async resolveSourceLabel() {
      return "Feylore";
    },
    async canViewerSeeSource() {
      // System achievements carry no source-membership signal.
      return true;
    },
  };
}

/** Goal-owned achievements: the goal owner defines and issues them. */
export function createGoalAchievementGuard(
  db: Database,
): AchievementSourceGuard {
  async function findGoal(sourceId: string) {
    return db.query.goals.findFirst({
      where: eq(schema.goals.id, sourceId),
    });
  }

  return {
    async assertCanManage(actor: AuthUser, sourceId: string) {
      const goal = requireGoalRow(await findGoal(sourceId));
      if (goal.userId !== actor.id) throw new ForbiddenError();
    },
    async resolveSourceLabel(sourceId: string) {
      const goal = await findGoal(sourceId);
      return goal ? goal.title : null;
    },
    async canViewerSeeSource(viewer: AuthUser, sourceId: string) {
      const goal = await findGoal(sourceId);
      if (!goal) return false;
      if (goal.userId === viewer.id) return true;
      return (
        goal.visibility === "public" &&
        viewer.permissions.has(PERMISSIONS.GOALS_READ)
      );
    },
  };
}

/** Challenge-owned achievements: creator or club moderators manage them. */
export function createChallengeAchievementGuard(
  db: Database,
): AchievementSourceGuard {
  async function findChallenge(sourceId: string) {
    return db.query.challenges.findFirst({
      where: eq(schema.challenges.id, sourceId),
    });
  }

  async function isParticipant(challengeId: string, userId: string) {
    const row = await db.query.challengeParticipants.findFirst({
      where: and(
        eq(schema.challengeParticipants.challengeId, challengeId),
        eq(schema.challengeParticipants.userId, userId),
      ),
    });
    return Boolean(row && row.state !== "left");
  }

  async function isClubMember(clubId: string, userId: string) {
    const row = await db.query.clubMembers.findFirst({
      where: and(
        eq(schema.clubMembers.clubId, clubId),
        eq(schema.clubMembers.userId, userId),
      ),
    });
    return Boolean(row);
  }

  async function isClubModerator(clubId: string, userId: string) {
    const row = await db.query.clubMembers.findFirst({
      where: and(
        eq(schema.clubMembers.clubId, clubId),
        eq(schema.clubMembers.userId, userId),
      ),
    });
    if (row?.role === "moderator" || row?.role === "owner") return true;
    const club = await db.query.clubs.findFirst({
      where: eq(schema.clubs.id, clubId),
    });
    return club?.ownerUserId === userId;
  }

  return {
    async assertCanManage(actor: AuthUser, sourceId: string) {
      const challenge = await findChallenge(sourceId);
      if (!challenge) throw new NotFoundError("Challenge not found");
      if (challenge.creatorUserId === actor.id) return;
      if (
        challenge.clubId &&
        (await isClubModerator(challenge.clubId, actor.id))
      ) {
        return;
      }
      throw new ForbiddenError();
    },
    async resolveSourceLabel(sourceId: string) {
      const challenge = await findChallenge(sourceId);
      return challenge ? challenge.title : null;
    },
    async canViewerSeeSource(viewer: AuthUser, sourceId: string) {
      const challenge = await findChallenge(sourceId);
      if (!challenge) return false;
      if (challenge.creatorUserId === viewer.id) return true;
      if (await isParticipant(challenge.id, viewer.id)) return true;
      if (challenge.clubId) {
        return isClubMember(challenge.clubId, viewer.id);
      }
      return (
        challenge.visibility === "public" &&
        viewer.permissions.has(PERMISSIONS.GOALS_READ)
      );
    },
  };
}
