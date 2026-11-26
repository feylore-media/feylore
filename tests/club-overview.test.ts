import { describe, it, expect, vi } from "vitest";
import { ClubOverviewService } from "../src/server/modules/clubs/overview.js";
import type { AuthUser } from "../src/server/modules/authorization/service.js";
import type { ClubOverview } from "../src/shared/clubs.js";

const user = { id: "user-1" } as AuthUser;

describe("ClubOverviewService", () => {
  it("aggregates existing club services without duplicating logic", async () => {
    const checkIn = {
      target: null,
      lastCheckIn: null,
      nextCheckIn: null,
      displayOccurrenceId: null,
      viewerCheckedIn: false,
      checkedInCount: 0,
      memberCount: 1,
    };
    const work = {
      id: "work-1",
      workSubjectType: "book" as const,
      workSubjectId: "book-1",
      status: "current" as const,
      sortOrder: 0,
      title: "Test Book",
      coverFileId: null,
      href: "/books/test",
      addedAt: "2026-01-01T00:00:00.000Z",
    };
    const discussionAnchors = [
      {
        id: "occ-1",
        occurrenceId: "occ-1",
        consumption: { kind: "chapter" as const, start: 1 },
        label: "Chapter 1",
        topicId: null,
        messageCount: 0,
        lastActivityAt: null,
        emphasis: null,
      },
    ];
    const activePoll = null;
    const quotes = [
      {
        id: "quote-1",
        clubId: "club-1",
        authorUserId: user.id,
        authorUsername: "reader",
        authorDisplayName: "Reader",
        workSubjectType: "book" as const,
        workSubjectId: "book-1",
        text: "A memorable line.",
        sourceAnnotationId: null,
        locator: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const viewerProgress = {
      kind: "reading" as const,
      type: "epub-cfi" as const,
      value: "epubcfi(/6/4!)",
    };

    const clubs = {
      requireView: vi.fn().mockResolvedValue({ context: "book" }),
    };
    const clubCheckIns = {
      getSummary: vi.fn().mockResolvedValue(checkIn),
    };
    const clubWorks = {
      getCurrentWorkDetail: vi.fn().mockResolvedValue(work),
    };
    const clubDiscussionAnchors = {
      listDefault: vi.fn().mockResolvedValue(discussionAnchors),
    };
    const clubPolls = {
      getActive: vi.fn().mockResolvedValue(activePoll),
    };
    const clubQuotes = {
      listOverview: vi.fn().mockResolvedValue(quotes),
    };
    const userState = {
      getProgress: vi.fn().mockResolvedValue({ locator: viewerProgress }),
    };

    const service = new ClubOverviewService(
      clubs as never,
      clubCheckIns as never,
      clubWorks as never,
      clubDiscussionAnchors as never,
      clubPolls as never,
      clubQuotes as never,
      userState as never,
    );

    const overview = await service.getOverview(user, "club-1");

    expect(clubs.requireView).toHaveBeenCalledWith(user, "club-1");
    expect(clubCheckIns.getSummary).toHaveBeenCalledWith(user, "club-1");
    expect(clubWorks.getCurrentWorkDetail).toHaveBeenCalledWith(user, "club-1");
    expect(clubDiscussionAnchors.listDefault).toHaveBeenCalledWith(
      user,
      "club-1",
      5,
    );
    expect(clubPolls.getActive).toHaveBeenCalledWith(user, "club-1");
    expect(clubQuotes.listOverview).toHaveBeenCalledWith(user, "club-1", 5);
    expect(userState.getProgress).toHaveBeenCalledWith(
      user.id,
      work.workSubjectType,
      work.workSubjectId,
    );

    expect(overview).toEqual({
      checkIn,
      work,
      discussionAnchors,
      activePoll,
      quotes,
      viewerProgress,
    } satisfies ClubOverview);
  });

  it("skips quotes and viewer progress when club is not a book club", async () => {
    const clubs = {
      requireView: vi.fn().mockResolvedValue({ context: "video" }),
    };
    const clubCheckIns = {
      getSummary: vi.fn().mockResolvedValue({
        target: null,
        lastCheckIn: null,
        nextCheckIn: null,
        displayOccurrenceId: null,
        viewerCheckedIn: false,
        checkedInCount: 0,
        memberCount: 0,
      }),
    };
    const clubWorks = {
      getCurrentWorkDetail: vi.fn().mockResolvedValue(null),
    };
    const clubDiscussionAnchors = {
      listDefault: vi.fn().mockResolvedValue([]),
    };
    const clubPolls = {
      getActive: vi.fn().mockResolvedValue(null),
    };
    const clubQuotes = {
      listOverview: vi.fn(),
    };
    const userState = {
      getProgress: vi.fn(),
    };

    const service = new ClubOverviewService(
      clubs as never,
      clubCheckIns as never,
      clubWorks as never,
      clubDiscussionAnchors as never,
      clubPolls as never,
      clubQuotes as never,
      userState as never,
    );

    const overview = await service.getOverview(user, "club-2");

    expect(clubQuotes.listOverview).not.toHaveBeenCalled();
    expect(userState.getProgress).not.toHaveBeenCalled();
    expect(overview.quotes).toEqual([]);
    expect(overview.viewerProgress).toBeNull();
  });
});
