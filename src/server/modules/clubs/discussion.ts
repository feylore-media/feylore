import type { ReadingLocator } from "../../../shared/books.js";
import type { BooksService } from "../books/service.js";
import { canSeeClubLocation, safeLocationLabel } from "./safe-projection.js";
import { ClubContentProjection } from "./content-projection.js";
import type { ReadingProgressService } from "../reading-progress/service.js";
import type { MediaLocation } from "../../../shared/media-location.js";
import {
  eq,
  and,
  desc,
  lt,
  gt,
  sql,
  inArray,
  getTableColumns,
} from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors.js";
import type { AuthUser } from "../authorization/service.js";
import type { ClubService } from "./service.js";
import type { UserStateService } from "../user-state/service.js";
import type { TvService } from "../tv/service.js";
import type { DomainEventBus } from "../notifications/events.js";
import {
  extractChapterNumber,
  parseStoredPostBody,
  prepareClubPostBody,
  type ClubPostBodyFormat,
} from "../../../shared/club-spoiler.js";
import type { ProgressLocator } from "../../../shared/progress-locator.js";
import { normalizeProfileCosmetics } from "../../../shared/profile-cosmetics.js";
import {
  extractMentionUsernames,
  type ClubFeedItem,
  type ClubFeedPage,
  type ClubMention,
  type ClubPost,
  type ClubReactionSummary,
  type ClubTopic,
  type ClubTopicDetail,
  type ConsumptionTarget,
} from "../../../shared/clubs.js";

export class ClubDiscussionService {
  private projection: ClubContentProjection;
  private books?: BooksService;
  private domainEvents?: DomainEventBus;
  setDomainEvents(events: DomainEventBus) {
    this.domainEvents = events;
  }
  setBooks(service: BooksService) {
    this.books = service;
  }
  setPrimaryProgress(service: ReadingProgressService) {
    this.projection = new ClubContentProjection(
      this.db,
      this.userState,
      service,
    );
  }
  constructor(
    private readonly db: Database,
    private readonly clubs: ClubService,
    private readonly userState: UserStateService,
    private readonly tv: TvService,
  ) {
    this.projection = new ClubContentProjection(db, userState);
  }

  private async requireParticipate(user: AuthUser, clubId: string) {
    const club = await this.clubs.requireView(user, clubId);
    const membership = await this.clubs.getMembership(clubId, user.id);
    if (!membership) {
      throw new ForbiddenError("Club membership required");
    }
    return { club, membership };
  }

  private async getMemberUsernameMap(clubId: string) {
    const members = await this.clubs.listMembers(clubId);
    const byUsername = new Map<
      string,
      { userId: string; username: string; displayName: string }
    >();
    for (const member of members) {
      byUsername.set(member.username.toLowerCase(), {
        userId: member.userId,
        username: member.username,
        displayName: member.displayName,
      });
    }
    return byUsername;
  }

  private resolveMentions(
    body: string,
    memberMap: Map<
      string,
      { userId: string; username: string; displayName: string }
    >,
  ): ClubMention[] {
    const usernames = extractMentionUsernames(body);
    const mentions: ClubMention[] = [];
    const seen = new Set<string>();
    for (const username of usernames) {
      const member = memberMap.get(username);
      if (!member || seen.has(member.userId)) continue;
      seen.add(member.userId);
      mentions.push({
        userId: member.userId,
        username: member.username,
        displayName: member.displayName,
      });
    }
    return mentions;
  }

  private formatContentBody(
    bodyFormat: ClubPostBodyFormat,
    body: string,
    options?: { autoHidden?: boolean; autoHiddenReason?: string | null },
  ): Pick<
    ClubPost,
    "body" | "bodyFormat" | "segments" | "autoHidden" | "autoHiddenReason"
  > {
    if (options?.autoHidden)
      return {
        body: "",
        bodyFormat: "plain",
        autoHidden: true,
        autoHiddenReason: "Beyond your safe progress",
      };
    const parsed = parseStoredPostBody(bodyFormat, body);
    return {
      body: parsed.plainText,
      bodyFormat: parsed.bodyFormat,
      segments:
        parsed.bodyFormat === "structured" ? parsed.segments : undefined,
      autoHidden: options?.autoHidden ?? false,
      autoHiddenReason: options?.autoHiddenReason ?? null,
    };
  }

  private async loadViewerConsumptionContext(
    userId: string,
    workSubjectType: string | null,
    workSubjectId: string | null,
  ) {
    if (!workSubjectType || !workSubjectId) {
      return {
        progress: null as ProgressLocator | null,
        tvContinue: null as {
          seasonNumber: number;
          episodeNumber: number;
        } | null,
      };
    }

    const progressRow = await this.userState.getProgress(
      userId,
      workSubjectType,
      workSubjectId,
    );
    let tvContinue: { seasonNumber: number; episodeNumber: number } | null =
      null;

    if (workSubjectType === "show") {
      try {
        const show = await this.tv.getShowDetail(workSubjectId, userId);
        const episode = show.continueEpisode;
        if (episode) {
          tvContinue = {
            seasonNumber: episode.seasonNumber,
            episodeNumber: episode.episodeNumber,
          };
        }
      } catch {
        tvContinue = null;
      }
    }

    return {
      progress: progressRow?.locator ?? null,
      tvContinue,
    };
  }

  private validateMentions(
    body: string,
    memberMap: Map<
      string,
      { userId: string; username: string; displayName: string }
    >,
  ) {
    const usernames = extractMentionUsernames(body);
    for (const username of usernames) {
      if (!memberMap.has(username)) {
        throw new ValidationError(`Cannot mention non-member @${username}`);
      }
    }
  }

  private async persistMentions(
    mentions: ClubMention[],
    options: { topicId?: string; postId?: string },
    executor: Pick<Database, "insert"> = this.db,
  ) {
    if (mentions.length === 0) return;
    await executor.insert(schema.clubContentMentions).values(
      mentions.map((mention) => ({
        id: generateId(),
        topicId: options.topicId ?? null,
        postId: options.postId ?? null,
        mentionedUserId: mention.userId,
      })),
    );
  }

  private async loadTopicMentions(topicIds: string[]) {
    const map = new Map<string, ClubMention[]>();
    if (topicIds.length === 0) return map;

    const rows = await this.db
      .select({
        topicId: schema.clubContentMentions.topicId,
        userId: schema.users.id,
        username: schema.users.username,
        displayName: schema.users.displayName,
        cosmetics: schema.userProfiles.cosmetics,
      })
      .from(schema.clubContentMentions)
      .innerJoin(
        schema.users,
        eq(schema.clubContentMentions.mentionedUserId, schema.users.id),
      )
      .leftJoin(
        schema.userProfiles,
        eq(schema.userProfiles.userId, schema.users.id),
      )
      .where(inArray(schema.clubContentMentions.topicId, topicIds));

    for (const row of rows) {
      if (!row.topicId) continue;
      const list = map.get(row.topicId) ?? [];
      list.push({
        userId: row.userId,
        username: row.username,
        displayName: row.displayName,
        cosmetics: normalizeProfileCosmetics(row.cosmetics),
      });
      map.set(row.topicId, list);
    }
    return map;
  }

  private async loadPostMentions(postIds: string[]) {
    const map = new Map<string, ClubMention[]>();
    if (postIds.length === 0) return map;

    const rows = await this.db
      .select({
        postId: schema.clubContentMentions.postId,
        userId: schema.users.id,
        username: schema.users.username,
        displayName: schema.users.displayName,
        cosmetics: schema.userProfiles.cosmetics,
      })
      .from(schema.clubContentMentions)
      .innerJoin(
        schema.users,
        eq(schema.clubContentMentions.mentionedUserId, schema.users.id),
      )
      .leftJoin(
        schema.userProfiles,
        eq(schema.userProfiles.userId, schema.users.id),
      )
      .where(inArray(schema.clubContentMentions.postId, postIds));

    for (const row of rows) {
      if (!row.postId) continue;
      const list = map.get(row.postId) ?? [];
      list.push({
        userId: row.userId,
        username: row.username,
        displayName: row.displayName,
        cosmetics: normalizeProfileCosmetics(row.cosmetics),
      });
      map.set(row.postId, list);
    }
    return map;
  }

  private async loadPostReactions(postIds: string[], viewerUserId: string) {
    const map = new Map<string, ClubReactionSummary[]>();
    if (postIds.length === 0) return map;

    const rows = await this.db
      .select({
        postId: schema.clubPostReactions.postId,
        reaction: schema.clubPostReactions.reaction,
        userId: schema.clubPostReactions.userId,
      })
      .from(schema.clubPostReactions)
      .where(inArray(schema.clubPostReactions.postId, postIds));

    const grouped = new Map<
      string,
      Map<string, { count: number; viewerReacted: boolean }>
    >();
    for (const row of rows) {
      const byPost = grouped.get(row.postId) ?? new Map();
      const entry = byPost.get(row.reaction) ?? {
        count: 0,
        viewerReacted: false,
      };
      entry.count += 1;
      if (row.userId === viewerUserId) entry.viewerReacted = true;
      byPost.set(row.reaction, entry);
      grouped.set(row.postId, byPost);
    }

    for (const [postId, reactions] of grouped) {
      map.set(
        postId,
        [...reactions.entries()].map(([reaction, data]) => ({
          reaction: reaction as ClubReactionSummary["reaction"],
          count: data.count,
          viewerReacted: data.viewerReacted,
        })),
      );
    }
    return map;
  }

  private toTopic(
    row: typeof schema.clubTopics.$inferSelect & {
      authorUsername: string;
      authorDisplayName: string;
      authorCosmetics?: unknown;
    },
    mentions: ClubMention[],
    contentOptions?: { autoHidden?: boolean; autoHiddenReason?: string | null },
  ): ClubTopic {
    const content = this.formatContentBody(
      row.bodyFormat as ClubPostBodyFormat,
      row.body,
      contentOptions,
    );
    return {
      id: row.id,
      clubId: row.clubId,
      authorUserId: row.authorUserId,
      authorUsername: row.authorUsername,
      authorDisplayName: row.authorDisplayName,
      authorCosmetics: normalizeProfileCosmetics(row.authorCosmetics),
      kind: row.kind,
      title: contentOptions?.autoHidden ? "" : row.title,
      clubReadId: row.clubReadId,
      locked: contentOptions?.autoHidden ?? false,
      locationLabel: safeLocationLabel(row.mediaLocation),
      ...content,
      workSubjectType:
        (row.workSubjectType as ClubTopic["workSubjectType"]) ?? null,
      workSubjectId: row.workSubjectId ?? null,
      scheduleOccurrenceId: row.scheduleOccurrenceId ?? null,
      pinned: row.pinned,
      closed: row.closed,
      replyCount: row.replyCount,
      mentions: contentOptions?.autoHidden ? [] : mentions,
      lastActivityAt: row.lastActivityAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listTopics(
    user: AuthUser,
    clubId: string,
    options?: { cursor?: string; limit?: number },
  ) {
    await this.clubs.requireView(user, clubId);
    const limit = Math.min(options?.limit ?? 50, 100);
    const conditions = [eq(schema.clubTopics.clubId, clubId)];
    if (options?.cursor) {
      conditions.push(
        lt(schema.clubTopics.lastActivityAt, new Date(options.cursor)),
      );
    }

    const rows = await this.db
      .select({
        topic: schema.clubTopics,
        authorUsername: schema.users.username,
        authorDisplayName: schema.users.displayName,
        authorCosmetics: schema.userProfiles.cosmetics,
      })
      .from(schema.clubTopics)
      .innerJoin(
        schema.users,
        eq(schema.clubTopics.authorUserId, schema.users.id),
      )
      .leftJoin(
        schema.userProfiles,
        eq(schema.userProfiles.userId, schema.users.id),
      )
      .where(and(...conditions))
      .orderBy(
        desc(schema.clubTopics.pinned),
        desc(schema.clubTopics.lastActivityAt),
      )
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const mentionMap = await this.loadTopicMentions(
      page.map((r) => r.topic.id),
    );

    const visibility = await this.projection.topics(
      user.id,
      page.map((row) => row.topic),
    );
    const topics = page.map((row) =>
      this.toTopic(
        {
          ...row.topic,
          authorUsername: row.authorUsername,
          authorDisplayName: row.authorDisplayName,
          authorCosmetics: normalizeProfileCosmetics(row.authorCosmetics),
        },
        mentionMap.get(row.topic.id) ?? [],
        { autoHidden: !visibility.get(row.topic.id)!.visible },
      ),
    );

    const last = page[page.length - 1];
    return {
      topics,
      nextCursor:
        hasMore && last ? last.topic.lastActivityAt.toISOString() : undefined,
    };
  }

  private async resolveAssociation(
    user: AuthUser,
    clubId: string,
    input: {
      clubReadId?: string;
      mediaLocation?: MediaLocation;
      sharedQuoteId?: string;
      sourceAnnotationId?: string;
      readerLocator?: ReadingLocator;
    },
  ) {
    let readId = input.clubReadId,
      location = input.mediaLocation;
    let sourceAnnotationId: string | undefined = input.sourceAnnotationId;
    if (input.sharedQuoteId) {
      const quote = await this.db.query.clubQuotes.findFirst({
        where: and(
          eq(schema.clubQuotes.id, input.sharedQuoteId),
          eq(schema.clubQuotes.clubId, clubId),
        ),
      });
      if (!quote) throw new NotFoundError("Shared passage not found");
      if (!(await this.projection.quote(user.id, quote)).visible)
        throw new ForbiddenError("Passage is locked");
      if (readId && readId !== quote.clubReadId)
        throw new ValidationError("Passage belongs to another read");
      readId = quote.clubReadId ?? undefined;
      location = quote.spoilerBoundary ?? undefined;
      const loc = quote.locatorJson as {
        cfi?: string;
        href?: string;
        totalProgression?: number;
      } | null;
      if (location && (loc?.href || loc?.cfi))
        location = {
          ...location,
          reference: JSON.stringify({
            cfi: loc.cfi,
            href: loc.href,
            totalProgression: loc.totalProgression,
          }),
        };
      sourceAnnotationId = undefined;
    }
    if (!readId) {
      if (location || sourceAnnotationId)
        throw new ValidationError("A read is required for this location");
      return {};
    }
    const read = await this.db.query.clubReads.findFirst({
      where: and(
        eq(schema.clubReads.id, readId),
        eq(schema.clubReads.clubId, clubId),
      ),
    });
    if (!read) throw new NotFoundError("Club Read not found");
    if (read.status !== "active")
      throw new ValidationError("New read discussions require an active read");
    if (input.readerLocator && !sourceAnnotationId && !input.sharedQuoteId) {
      if (!read.workSubjectId || read.workSubjectType !== "book")
        throw new ValidationError("Reader locations require a canonical book");
      const locator = input.readerLocator;
      location = {
        kind: "chapter",
        progression: locator.totalProgression,
        reference: JSON.stringify({
          cfi: locator.cfi,
          href: locator.href,
          totalProgression: locator.totalProgression,
        }),
      };
      if (locator.totalProgression === undefined)
        location = { ...location, kind: "final" };
    }
    if (sourceAnnotationId) {
      const annotation = await this.userState.getAnnotation(
        user.id,
        sourceAnnotationId,
      );
      if (!annotation)
        throw new ForbiddenError("Annotation ownership required");
      const source = await this.db.query.userAnnotations.findFirst({
        where: and(
          eq(schema.userAnnotations.id, sourceAnnotationId),
          eq(schema.userAnnotations.userId, user.id),
        ),
      });
      if (
        source?.subjectId !== read.workSubjectId ||
        source.subjectType !== read.workSubjectType
      )
        throw new ValidationError("Annotation belongs to another Work");
      location =
        annotation.locator.totalProgression !== undefined
          ? {
              kind: "chapter",
              progression: annotation.locator.totalProgression,
            }
          : { kind: "final" };
    }
    if (
      !location ||
      (location.reference &&
        !sourceAnnotationId &&
        !input.sharedQuoteId &&
        !input.readerLocator)
    )
      throw new ValidationError("A structural spoiler boundary is required");
    if (sourceAnnotationId && location) {
      const annotation = await this.userState.getAnnotation(
        user.id,
        sourceAnnotationId,
      );
      if (annotation?.locator.cfi || annotation?.locator.href)
        location = {
          ...location,
          reference: JSON.stringify({
            cfi: annotation.locator.cfi,
            href: annotation.locator.href,
            totalProgression: annotation.locator.totalProgression,
          }),
        };
    }
    const progress = await this.projection.progress(user.id, read);
    if (!canSeeClubLocation(progress, location))
      throw new ForbiddenError("Location is beyond your safe progress");
    return {
      sharedQuoteId: input.sharedQuoteId ?? null,
      clubReadId: read.id,
      mediaLocation: location,
      spoilerBoundary: location,
      workSubjectType: read.workSubjectType,
      workSubjectId: read.workSubjectId,
    };
  }
  async index(
    user: AuthUser,
    clubId: string,
    options: {
      clubReadId?: string;
      cursor?: string;
      quoteCursor?: string;
      unread?: boolean;
    } = {},
  ) {
    await this.clubs.requireView(user, clubId);
    const read = options.clubReadId
      ? await this.db.query.clubReads.findFirst({
          where: and(
            eq(schema.clubReads.id, options.clubReadId),
            eq(schema.clubReads.clubId, clubId),
          ),
        })
      : await this.db.query.clubReads.findFirst({
          where: and(
            eq(schema.clubReads.clubId, clubId),
            eq(schema.clubReads.status, "active"),
          ),
        });
    if (options.clubReadId && !read)
      throw new NotFoundError("Club Read not found");
    const scope = options.clubReadId
      ? eq(schema.clubTopics.clubReadId, options.clubReadId)
      : sql`(${schema.clubTopics.clubReadId} IS NULL OR ${schema.clubTopics.clubReadId}=${read?.id ?? null}::uuid)`;
    const unread = sql`NOT EXISTS(SELECT 1 FROM club_topic_read_state r WHERE r.topic_id=${schema.clubTopics.id} AND r.user_id=${user.id} AND r.read_at>=${schema.clubTopics.lastActivityAt})`;
    const rows = await this.db
      .select({
        topic: { ...getTableColumns(schema.clubTopics), body: sql<string>`''` },
        author: schema.users.displayName,
        unread,
      })
      .from(schema.clubTopics)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.clubTopics.authorUserId),
      )
      .where(
        and(
          eq(schema.clubTopics.clubId, clubId),
          scope,
          options.unread ? unread : undefined,
          options.cursor
            ? sql`(${schema.clubTopics.lastActivityAt},${schema.clubTopics.id}) < (SELECT last_activity_at,id FROM club_topics WHERE id=${options.cursor}::uuid AND club_id=${clubId}::uuid)`
            : undefined,
        ),
      )
      .orderBy(
        desc(schema.clubTopics.lastActivityAt),
        desc(schema.clubTopics.id),
      )
      .limit(51);
    const page = rows.slice(0, 50),
      visibility = await this.projection.topics(
        user.id,
        page.map((r) => r.topic),
      );
    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        clubReadId: string | null;
        locked: boolean;
        topics: {
          id: string;
          title: string | null;
          author: string;
          unread: boolean;
          replyCount: number;
          pinned: boolean;
          closed: boolean;
          sharedQuoteId: string | null;
        }[];
      }
    >();
    for (const row of page) {
      const safety = visibility.get(row.topic.id)!;
      const key = (row.topic.clubReadId ?? "general") + ":" + safety.label;
      const group = groups.get(key) ?? {
        key,
        label: row.topic.clubReadId ? safety.label : "General",
        clubReadId: row.topic.clubReadId,
        locked: !safety.visible,
        topics: [],
      };
      group.topics.push({
        id: row.topic.id,
        title: safety.visible ? row.topic.title : null,
        author: row.author,
        unread: Boolean(row.unread),
        replyCount: row.topic.replyCount,
        pinned: row.topic.pinned,
        closed: row.topic.closed,
        sharedQuoteId: row.topic.sharedQuoteId,
      });
      groups.set(key, group);
    }
    const progress = read
      ? await this.projection.progress(user.id, read)
      : null;
    const quotes = await this.db
      .select({
        ...getTableColumns(schema.clubQuotes),
        authorDisplayName: schema.users.displayName,
      })
      .from(schema.clubQuotes)
      .innerJoin(
        schema.users,
        eq(schema.clubQuotes.authorUserId, schema.users.id),
      )
      .where(
        and(
          eq(schema.clubQuotes.clubId, clubId),
          options.clubReadId
            ? eq(schema.clubQuotes.clubReadId, options.clubReadId)
            : sql`(${schema.clubQuotes.clubReadId} IS NULL OR ${schema.clubQuotes.clubReadId}=${read?.id ?? null}::uuid)`,
          options.quoteCursor
            ? sql`(${schema.clubQuotes.createdAt},${schema.clubQuotes.id}) < (SELECT created_at,id FROM club_quotes WHERE id=${options.quoteCursor}::uuid AND club_id=${clubId}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(schema.clubQuotes.createdAt), desc(schema.clubQuotes.id))
      .limit(21);
    const quoteSafety = await this.projection.quotes(
      user.id,
      quotes.slice(0, 20),
    );
    const mayModerate = await this.clubs.canModerate(
      user,
      await this.clubs.getClub(clubId),
    );
    const passages = await Promise.all(
      quotes.slice(0, 20).map(async (quote) => {
        const safety = quoteSafety.get(quote.id)!;
        return {
          id: quote.id,
          clubReadId: quote.clubReadId,
          label: quote.clubReadId ? safety.label : "General",
          text: safety.visible ? quote.text : null,
          locked: !safety.visible,
          authorUserId: quote.authorUserId,
          authorDisplayName: quote.authorDisplayName,
          canUnshare: quote.authorUserId === user.id || mayModerate,
        };
      }),
    );
    return {
      read: read
        ? {
            id: read.id,
            title: read.candidateSnapshot?.title ?? "Club Read",
            status: read.status,
          }
        : null,
      progressLabel:
        progress &&
        "title" in progress &&
        extractChapterNumber(progress.title ?? "") !== null
          ? "Chapter " + extractChapterNumber(progress.title ?? "")
          : progress &&
              "totalProgression" in progress &&
              progress.totalProgression !== undefined
            ? Math.round(progress.totalProgression * 100) + "%"
            : null,
      groups: [...groups.values()].sort((a, b) =>
        a.clubReadId === null
          ? -1
          : b.clubReadId === null
            ? 1
            : a.label.localeCompare(b.label, undefined, { numeric: true }),
      ),
      passages,
      nextPassageCursor: quotes.length > 20 ? quotes[19]!.id : null,
      nextCursor: rows.length > 50 ? page.at(-1)!.topic.id : null,
    };
  }
  async createTopic(
    user: AuthUser,
    clubId: string,
    input: {
      kind: "discussion" | "announcement";
      title: string;
      body: string;
      bodyFormat?: ClubPostBodyFormat;
      clubReadId?: string;
      mediaLocation?: MediaLocation;
      sharedQuoteId?: string;
      sourceAnnotationId?: string;
      readerLocator?: ReadingLocator;
    },
  ) {
    const { club } = await this.requireParticipate(user, clubId);
    if (
      input.kind === "announcement" &&
      !(await this.clubs.canModerate(user, club))
    )
      throw new ForbiddenError("Moderator access required");
    const association = await this.resolveAssociation(user, clubId, input);
    const prepared = prepareClubPostBody(input.body, input.bodyFormat);
    const memberMap = await this.getMemberUsernameMap(clubId);
    this.validateMentions(prepared.plainText, memberMap);
    const mentions = this.resolveMentions(prepared.plainText, memberMap);

    const id = generateId();
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.clubTopics).values({
        id,
        clubId,
        authorUserId: user.id,
        kind: input.kind,
        ...association,
        title: input.title,
        body: prepared.storageBody,
        bodyFormat: prepared.bodyFormat,
        lastActivityAt: now,
      });
      await this.persistMentions(mentions, { topicId: id }, tx);
    });
    if (this.domainEvents && mentions.length > 0) {
      await this.domainEvents.publish(
        "club.mention.created",
        {
          clubId,
          topicId: id,
          mentionedUserIds: mentions.map((m) => m.userId),
          actorUsername: user.username,
          actorDisplayName: user.displayName,
          excerpt: prepared.plainText.slice(0, 160),
        },
        { actorUserId: user.id },
      );
    }
    return id;
  }

  async createScheduledTopic(input: {
    clubId: string;
    clubReadId?: string | null;
    authorUserId: string;
    title: string;
    body: string;
    workSubjectType?: string | null;
    workSubjectId?: string | null;
    scheduleOccurrenceId: string;
  }): Promise<string> {
    const occurrence = await this.db.query.clubScheduleOccurrences.findFirst({
      where: eq(schema.clubScheduleOccurrences.id, input.scheduleOccurrenceId),
    });
    const consumption = occurrence?.consumption as
      ConsumptionTarget | undefined;
    const boundary: MediaLocation | null =
      consumption?.kind === "chapter"
        ? { kind: "chapter", position: consumption.start }
        : consumption?.kind === "page"
          ? { kind: "page", position: consumption.start }
          : consumption?.kind === "episode"
            ? { kind: "episode", position: consumption.start }
            : null;
    const id = generateId();
    const now = new Date();
    await this.db.insert(schema.clubTopics).values({
      mediaLocation: boundary,
      spoilerBoundary: boundary,
      id,
      clubId: input.clubId,
      authorUserId: input.authorUserId,
      kind: "discussion",
      title: input.title,
      body: input.body,
      workSubjectType: input.workSubjectType ?? null,
      workSubjectId: input.workSubjectId ?? null,
      scheduleOccurrenceId: input.scheduleOccurrenceId,
      clubReadId: input.clubReadId ?? null,
      lastActivityAt: now,
    });
    return id;
  }

  async getTopic(
    user: AuthUser,
    clubId: string,
    topicId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<ClubTopicDetail> {
    const club = await this.clubs.requireView(user, clubId);
    const membership = await this.clubs.getMembership(clubId, user.id);

    const topicRow = await this.db
      .select({
        topic: schema.clubTopics,
        authorUsername: schema.users.username,
        authorDisplayName: schema.users.displayName,
        authorCosmetics: schema.userProfiles.cosmetics,
      })
      .from(schema.clubTopics)
      .innerJoin(
        schema.users,
        eq(schema.clubTopics.authorUserId, schema.users.id),
      )
      .leftJoin(
        schema.userProfiles,
        eq(schema.userProfiles.userId, schema.users.id),
      )
      .where(
        and(
          eq(schema.clubTopics.id, topicId),
          eq(schema.clubTopics.clubId, clubId),
        ),
      )
      .limit(1);

    const row = topicRow[0];
    if (!row) throw new NotFoundError("Topic not found");

    let anchorConsumption: ConsumptionTarget | null = null;
    let occurrenceWorkSubjectType = row.topic.workSubjectType;
    let occurrenceWorkSubjectId = row.topic.workSubjectId;

    if (row.topic.scheduleOccurrenceId) {
      const occurrence = await this.db.query.clubScheduleOccurrences.findFirst({
        where: eq(
          schema.clubScheduleOccurrences.id,
          row.topic.scheduleOccurrenceId,
        ),
      });
      if (occurrence) {
        anchorConsumption = occurrence.consumption as ConsumptionTarget;
        occurrenceWorkSubjectType =
          occurrenceWorkSubjectType ?? occurrence.workSubjectType;
        occurrenceWorkSubjectId =
          occurrenceWorkSubjectId ?? occurrence.workSubjectId;
      }
    }

    const viewerContext = await this.loadViewerConsumptionContext(
      user.id,
      occurrenceWorkSubjectType,
      occurrenceWorkSubjectId,
    );
    const visibility = (await this.projection.topics(user.id, [row.topic])).get(
      topicId,
    )!;
    viewerContext.progress = visibility.progress ?? viewerContext.progress;
    const autoHide = {
      autoHidden: !visibility.visible,
      autoHiddenReason: visibility.visible ? null : "Beyond your safe progress",
    };
    anchorConsumption = visibility.consumption;

    if (!visibility.visible)
      return {
        topic: this.toTopic(
          {
            ...row.topic,
            authorUsername: row.authorUsername,
            authorDisplayName: row.authorDisplayName,
            authorCosmetics: normalizeProfileCosmetics(row.authorCosmetics),
          },
          [],
          { autoHidden: true },
        ),
        posts: [],
        canReply: false,
        canModerate: await this.clubs.canModerate(user, club),
        viewerProgress: viewerContext.progress,
        anchorConsumption,
      };
    const limit = Math.min(options?.limit ?? 50, 100);
    const postConditions = [eq(schema.clubPosts.topicId, topicId)];
    if (options?.cursor) {
      postConditions.push(
        gt(schema.clubPosts.createdAt, new Date(options.cursor)),
      );
    }

    const postRows = await this.db
      .select({
        post: schema.clubPosts,
        authorUsername: schema.users.username,
        authorDisplayName: schema.users.displayName,
        authorCosmetics: schema.userProfiles.cosmetics,
      })
      .from(schema.clubPosts)
      .innerJoin(
        schema.users,
        eq(schema.clubPosts.authorUserId, schema.users.id),
      )
      .leftJoin(
        schema.userProfiles,
        eq(schema.userProfiles.userId, schema.users.id),
      )
      .where(and(...postConditions))
      .orderBy(schema.clubPosts.createdAt)
      .limit(limit + 1);

    const hasMore = postRows.length > limit;
    const page = hasMore ? postRows.slice(0, limit) : postRows;
    const postIds = page.map((r) => r.post.id);
    const mentionMap = await this.loadTopicMentions([topicId]);
    const postMentionMap = await this.loadPostMentions(postIds);
    const reactionMap = await this.loadPostReactions(postIds, user.id);
    const canModerate = await this.clubs.canModerate(user, club);

    const posts: ClubPost[] = page.map((postRow) => {
      const deleted = !!postRow.post.deletedAt;
      const canDelete =
        !deleted && (postRow.post.authorUserId === user.id || canModerate);
      const content = deleted
        ? {
            body: "",
            bodyFormat: "plain" as const,
            autoHidden: false,
            autoHiddenReason: null,
          }
        : this.formatContentBody(
            postRow.post.bodyFormat as ClubPostBodyFormat,
            postRow.post.body,
            autoHide,
          );
      return {
        id: postRow.post.id,
        topicId: postRow.post.topicId,
        authorUserId: postRow.post.authorUserId,
        authorUsername: postRow.authorUsername,
        authorDisplayName: postRow.authorDisplayName,
        authorCosmetics: normalizeProfileCosmetics(postRow.authorCosmetics),
        ...content,
        deleted,
        mentions: autoHide.autoHidden
          ? []
          : (postMentionMap.get(postRow.post.id) ?? []),
        reactions: reactionMap.get(postRow.post.id) ?? [],
        canDelete,
        createdAt: postRow.post.createdAt.toISOString(),
        updatedAt: postRow.post.updatedAt.toISOString(),
      };
    });

    const read = row.topic.clubReadId
      ? await this.db.query.clubReads.findFirst({
          where: eq(schema.clubReads.id, row.topic.clubReadId),
        })
      : null;
    const book =
      read?.workSubjectType === "book" && read.workSubjectId
        ? await this.db.query.books.findFirst({
            where: eq(schema.books.id, read.workSubjectId),
          })
        : null;
    const readable =
      visibility.visible &&
      book &&
      user.permissions.has("books.read") &&
      (await this.books?.canReadBook(user.id, book.id));
    let locator: string | undefined;
    try {
      const candidate = row.topic.mediaLocation?.reference;
      if (candidate) {
        const value = JSON.parse(candidate) as {
          href?: string;
          cfi?: string;
          totalProgression?: number;
        };
        if (value.href || value.cfi)
          locator = JSON.stringify({
            type: "epub-cfi",
            href: value.href,
            cfi: value.cfi,
            totalProgression: value.totalProgression,
          });
      }
    } catch {
      /* No reliable canonical jump. */
    }
    if (visibility.visible && membership && !hasMore)
      await this.db
        .insert(schema.clubTopicReadState)
        .values({ topicId, userId: user.id, readAt: row.topic.lastActivityAt })
        .onConflictDoUpdate({
          target: [
            schema.clubTopicReadState.topicId,
            schema.clubTopicReadState.userId,
          ],
          set: { readAt: row.topic.lastActivityAt },
        });
    const last = page[page.length - 1];
    return {
      readTitle: book?.title ?? read?.candidateSnapshot?.title ?? null,
      readerHref:
        readable && book
          ? `/read/book/${book.slug}${locator ? "?locator=" + encodeURIComponent(locator) : ""}`
          : null,
      topic: this.toTopic(
        {
          ...row.topic,
          authorUsername: row.authorUsername,
          authorDisplayName: row.authorDisplayName,
          authorCosmetics: normalizeProfileCosmetics(row.authorCosmetics),
        },
        mentionMap.get(topicId) ?? [],
        autoHide,
      ),
      posts,
      nextCursor:
        hasMore && last ? last.post.createdAt.toISOString() : undefined,
      canReply: !!membership && !row.topic.closed && visibility.visible,
      canModerate,
      viewerProgress: viewerContext.progress,
      anchorConsumption,
    };
  }

  async updateTopic(
    user: AuthUser,
    clubId: string,
    topicId: string,
    input: { pinned?: boolean; closed?: boolean },
  ) {
    const { club } = await this.requireParticipate(user, clubId);
    if (!(await this.clubs.canModerate(user, club))) {
      throw new ForbiddenError("Moderator access required");
    }

    const topic = await this.db.query.clubTopics.findFirst({
      where: and(
        eq(schema.clubTopics.id, topicId),
        eq(schema.clubTopics.clubId, clubId),
      ),
    });
    if (!topic) throw new NotFoundError("Topic not found");

    await this.db
      .update(schema.clubTopics)
      .set({
        ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
        ...(input.closed !== undefined ? { closed: input.closed } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.clubTopics.id, topicId));
  }

  async createPost(
    user: AuthUser,
    clubId: string,
    topicId: string,
    input: { body: string; bodyFormat?: ClubPostBodyFormat },
  ) {
    await this.requireParticipate(user, clubId);

    const topic = await this.db.query.clubTopics.findFirst({
      where: and(
        eq(schema.clubTopics.id, topicId),
        eq(schema.clubTopics.clubId, clubId),
      ),
    });
    if (!topic) throw new NotFoundError("Topic not found");
    if (!(await this.projection.topics(user.id, [topic])).get(topicId)!.visible)
      throw new ForbiddenError("Discussion is beyond your safe progress");
    if (topic.closed) {
      throw new ValidationError("Topic is closed");
    }

    const prepared = prepareClubPostBody(input.body, input.bodyFormat);
    const memberMap = await this.getMemberUsernameMap(clubId);
    this.validateMentions(prepared.plainText, memberMap);
    const mentions = this.resolveMentions(prepared.plainText, memberMap);

    const id = generateId();
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.clubPosts).values({
        id,
        topicId,
        authorUserId: user.id,
        body: prepared.storageBody,
        bodyFormat: prepared.bodyFormat,
      });
      await this.persistMentions(mentions, { postId: id }, tx);
      await tx
        .update(schema.clubTopics)
        .set({
          replyCount: sql`${schema.clubTopics.replyCount} + 1`,
          lastActivityAt: now,
          updatedAt: now,
        })
        .where(eq(schema.clubTopics.id, topicId));
    });
    if (this.domainEvents && mentions.length > 0) {
      await this.domainEvents.publish(
        "club.mention.created",
        {
          clubId,
          topicId,
          postId: id,
          mentionedUserIds: mentions.map((m) => m.userId),
          actorUsername: user.username,
          actorDisplayName: user.displayName,
          excerpt: prepared.plainText.slice(0, 160),
        },
        { actorUserId: user.id },
      );
    }
    return id;
  }

  async deletePost(
    user: AuthUser,
    clubId: string,
    topicId: string,
    postId: string,
  ) {
    const { club } = await this.requireParticipate(user, clubId);

    const topic = await this.db.query.clubTopics.findFirst({
      where: and(
        eq(schema.clubTopics.id, topicId),
        eq(schema.clubTopics.clubId, clubId),
      ),
    });
    if (!topic) throw new NotFoundError("Topic not found");

    if (!(await this.projection.topics(user.id, [topic])).get(topicId)!.visible)
      throw new ForbiddenError("Discussion is beyond your safe progress");
    const post = await this.db.query.clubPosts.findFirst({
      where: and(
        eq(schema.clubPosts.id, postId),
        eq(schema.clubPosts.topicId, topicId),
      ),
    });
    if (!post) throw new NotFoundError("Post not found");
    if (post.deletedAt) return;

    const canModerate = await this.clubs.canModerate(user, club);
    if (post.authorUserId !== user.id && !canModerate) {
      throw new ForbiddenError();
    }

    await this.db
      .update(schema.clubPosts)
      .set({
        deletedAt: new Date(),
        deletedByUserId: user.id,
        updatedAt: new Date(),
      })
      .where(eq(schema.clubPosts.id, postId));
  }

  async toggleReaction(
    user: AuthUser,
    clubId: string,
    topicId: string,
    postId: string,
    reaction: "like",
  ) {
    await this.requireParticipate(user, clubId);

    const topic = await this.db.query.clubTopics.findFirst({
      where: and(
        eq(schema.clubTopics.id, topicId),
        eq(schema.clubTopics.clubId, clubId),
      ),
    });
    if (!topic) throw new NotFoundError("Topic not found");

    const post = await this.db.query.clubPosts.findFirst({
      where: and(
        eq(schema.clubPosts.id, postId),
        eq(schema.clubPosts.topicId, topicId),
      ),
    });
    if (!post) throw new NotFoundError("Post not found");
    if (post.deletedAt) {
      throw new ValidationError("Cannot react to deleted post");
    }

    const existing = await this.db.query.clubPostReactions.findFirst({
      where: and(
        eq(schema.clubPostReactions.postId, postId),
        eq(schema.clubPostReactions.userId, user.id),
      ),
    });

    if (existing) {
      await this.db
        .delete(schema.clubPostReactions)
        .where(
          and(
            eq(schema.clubPostReactions.postId, postId),
            eq(schema.clubPostReactions.userId, user.id),
          ),
        );
      return { active: false };
    }

    await this.db.insert(schema.clubPostReactions).values({
      postId,
      userId: user.id,
      reaction,
    });
    return { active: true };
  }

  async getFeed(
    user: AuthUser,
    clubId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<ClubFeedPage> {
    await this.clubs.requireView(user, clubId);
    const limit = Math.min(options?.limit ?? 50, 100);
    const cursorDate = options?.cursor ? new Date(options.cursor) : null;

    const topicRows = await this.db
      .select({
        id: schema.clubTopics.id,
        type: sql<string>`'topic_created'`,
        actorUserId: schema.clubTopics.authorUserId,
        title: schema.clubTopics.title,
        kind: schema.clubTopics.kind,
        createdAt: schema.clubTopics.createdAt,
        username: schema.users.username,
        displayName: schema.users.displayName,
        cosmetics: schema.userProfiles.cosmetics,
      })
      .from(schema.clubTopics)
      .innerJoin(
        schema.users,
        eq(schema.clubTopics.authorUserId, schema.users.id),
      )
      .leftJoin(
        schema.userProfiles,
        eq(schema.userProfiles.userId, schema.users.id),
      )
      .where(
        cursorDate
          ? and(
              eq(schema.clubTopics.clubId, clubId),
              lt(schema.clubTopics.createdAt, cursorDate),
            )
          : eq(schema.clubTopics.clubId, clubId),
      )
      .orderBy(desc(schema.clubTopics.createdAt))
      .limit(limit + 1);

    const postRows = await this.db
      .select({
        id: schema.clubPosts.id,
        type: sql<string>`'post_created'`,
        actorUserId: schema.clubPosts.authorUserId,
        topicId: schema.clubTopics.id,
        topicTitle: schema.clubTopics.title,
        topicKind: schema.clubTopics.kind,
        createdAt: schema.clubPosts.createdAt,
        username: schema.users.username,
        displayName: schema.users.displayName,
        cosmetics: schema.userProfiles.cosmetics,
      })
      .from(schema.clubPosts)
      .innerJoin(
        schema.clubTopics,
        eq(schema.clubPosts.topicId, schema.clubTopics.id),
      )
      .innerJoin(
        schema.users,
        eq(schema.clubPosts.authorUserId, schema.users.id),
      )
      .leftJoin(
        schema.userProfiles,
        eq(schema.userProfiles.userId, schema.users.id),
      )
      .where(
        and(
          eq(schema.clubTopics.clubId, clubId),
          sql`${schema.clubPosts.deletedAt} IS NULL`,
          cursorDate ? lt(schema.clubPosts.createdAt, cursorDate) : undefined,
        ),
      )
      .orderBy(desc(schema.clubPosts.createdAt))
      .limit(limit + 1);

    const memberRows = await this.db
      .select({
        id: sql<string>`${schema.clubMembers.userId} || ':' || ${schema.clubMembers.joinedAt}`,
        type: sql<string>`'member_joined'`,
        actorUserId: schema.clubMembers.userId,
        createdAt: schema.clubMembers.joinedAt,
        username: schema.users.username,
        displayName: schema.users.displayName,
        cosmetics: schema.userProfiles.cosmetics,
      })
      .from(schema.clubMembers)
      .innerJoin(schema.users, eq(schema.clubMembers.userId, schema.users.id))
      .leftJoin(
        schema.userProfiles,
        eq(schema.userProfiles.userId, schema.users.id),
      )
      .where(
        cursorDate
          ? and(
              eq(schema.clubMembers.clubId, clubId),
              lt(schema.clubMembers.joinedAt, cursorDate),
            )
          : eq(schema.clubMembers.clubId, clubId),
      )
      .orderBy(desc(schema.clubMembers.joinedAt))
      .limit(limit + 1);

    type FeedRow = {
      id: string;
      type: "topic_created" | "post_created" | "member_joined";
      actorUserId: string;
      username: string;
      displayName: string;
      cosm: unknown;
      createdAt: Date;
      title?: string;
      kind?: "discussion" | "announcement";
      topicId?: string;
      topicTitle?: string;
      topicKind?: "discussion" | "announcement";
    };

    const combined: FeedRow[] = [
      ...topicRows.map((row) => ({
        id: `topic:${row.id}`,
        type: "topic_created" as const,
        actorUserId: row.actorUserId,
        username: row.username,
        displayName: row.displayName,
        cosm: row.cosmetics,
        createdAt: row.createdAt,
        title: row.title,
        kind: row.kind,
        topicId: row.id,
        topicTitle: row.title,
        topicKind: row.kind,
      })),
      ...postRows.map((row) => ({
        id: `post:${row.id}`,
        type: "post_created" as const,
        actorUserId: row.actorUserId,
        username: row.username,
        displayName: row.displayName,
        cosm: row.cosmetics,
        createdAt: row.createdAt,
        topicId: row.topicId,
        topicTitle: row.topicTitle,
        topicKind: row.topicKind,
        postId: row.id,
      })),
      ...memberRows.map((row) => ({
        id: `member:${row.id}`,
        type: "member_joined" as const,
        actorUserId: row.actorUserId,
        username: row.username,
        displayName: row.displayName,
        cosm: row.cosmetics,
        createdAt: row.createdAt,
      })),
    ];

    combined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const page = combined.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const topicIds = [
      ...new Set(
        page.map((row) => row.topicId).filter((id): id is string => !!id),
      ),
    ];
    const feedTopics = topicIds.length
      ? await this.db
          .select()
          .from(schema.clubTopics)
          .where(inArray(schema.clubTopics.id, topicIds))
      : [];
    const visibility = await this.projection.topics(user.id, feedTopics);
    for (const row of page)
      if (row.topicId && !visibility.get(row.topicId)?.visible) {
        row.title = undefined;
        row.topicTitle = undefined;
      }
    const items = (hasMore ? page.slice(0, limit) : page).map((row) =>
      this.toFeedItem(row),
    );
    const last = items[items.length - 1];

    return {
      items,
      nextCursor: hasMore && last ? last.createdAt : undefined,
    };
  }

  private toFeedItem(row: {
    id: string;
    type: "topic_created" | "post_created" | "member_joined";
    actorUserId: string;
    username: string;
    displayName: string;
    cosm?: unknown;
    createdAt: Date;
    title?: string;
    kind?: "discussion" | "announcement";
    topicId?: string;
    topicTitle?: string;
    topicKind?: "discussion" | "announcement";
    postId?: string;
  }): ClubFeedItem {
    let summary = "";
    if (row.type === "topic_created") {
      summary =
        row.kind === "announcement"
          ? `posted an announcement: ${row.title ?? "a locked discussion"}`
          : `started a discussion: ${row.title}`;
    } else if (row.type === "post_created") {
      summary = `replied in ${row.topicTitle ?? "a topic"}`;
    } else {
      summary = "joined the club";
    }

    return {
      id: row.id,
      type: row.type,
      actorUserId: row.actorUserId,
      actorUsername: row.username,
      actorDisplayName: row.displayName,
      actorCosmetics: normalizeProfileCosmetics(row.cosm),
      summary,
      topicId: row.topicId,
      topicTitle: row.topicTitle,
      topicKind: row.topicKind,
      postId: row.postId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
