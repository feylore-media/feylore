import type { AuthUser } from "../authorization/service.js";
import type { ClubService } from "./service.js";
import type { ClubCheckInService } from "./check-ins.js";
import type { ClubWorksService } from "./works.js";
import type { ClubDiscussionAnchorsService } from "./discussion-anchors.js";
import type { ClubPollsService } from "./polls.js";
import type { ClubQuotesService } from "./quotes.js";
import type { UserStateService } from "../user-state/service.js";
import type { ClubOverview } from "../../../shared/clubs.js";
import type { ClubExperienceService } from "./experience.js";

export class ClubOverviewService {
  private experience?: ClubExperienceService;
  setExperienceService(service: ClubExperienceService) {
    this.experience = service;
  }
  constructor(
    private readonly clubs: ClubService,
    private readonly clubCheckIns: ClubCheckInService,
    private readonly clubWorks: ClubWorksService,
    private readonly clubDiscussionAnchors: ClubDiscussionAnchorsService,
    private readonly clubPolls: ClubPollsService,
    private readonly clubQuotes: ClubQuotesService,
    private readonly userState: UserStateService,
  ) {}

  async getOverview(user: AuthUser, clubId: string): Promise<ClubOverview> {
    if (this.experience) {
      const projection = await this.experience.overview(user, clubId);
      return {
        ...projection,
        work: null,
        activePoll: null,
        discussionAnchors: [],
        quotes: [],
        viewerProgress: projection.activeRead?.viewerProgress ?? null,
        checkIn: {
          target: null,
          lastCheckIn: null,
          nextCheckIn: null,
          displayOccurrenceId: null,
          viewerCheckedIn: projection.activeRead?.viewerCheckedIn ?? false,
          checkedInCount: projection.activeRead?.caughtUpCount ?? 0,
          memberCount: projection.activeRead?.memberCount ?? 0,
        },
      };
    }
    const club = await this.clubs.requireView(user, clubId);

    const [checkIn, work, discussionAnchors, activePoll, quotes] =
      await Promise.all([
        this.clubCheckIns.getSummary(user, clubId),
        this.clubWorks.getCurrentWorkDetail(user, clubId),
        this.clubDiscussionAnchors.listDefault(user, clubId, 5),
        this.clubPolls.getActive(user, clubId),
        club.context === "book"
          ? this.clubQuotes.listOverview(user, clubId, 5)
          : Promise.resolve([]),
      ]);

    let viewerProgress: ClubOverview["viewerProgress"] = null;
    if (work) {
      const progressRow = await this.userState.getProgress(
        user.id,
        work.workSubjectType,
        work.workSubjectId,
      );
      viewerProgress = progressRow?.locator ?? null;
    }

    return {
      checkIn,
      work,
      discussionAnchors,
      activePoll,
      quotes,
      viewerProgress,
    };
  }
}
