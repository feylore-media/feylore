import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import clubs from "../../src/web/locales/en/clubs.json";
import books from "../../src/web/locales/en/books.json";
import metadata from "../../src/web/locales/en/metadata.json";
import home from "../../src/web/locales/en/home.json";
import { ClubDetailPage } from "../../src/web/app/pages/ClubDetailPage";
import { HomeUpcoming } from "../../src/web/components/home/HomeUpcoming";
import "../../src/web/styles/tokens.css";
import "../../src/web/styles/themes/feylore.css";
const params = new URLSearchParams(location.search),
  view = params.get("view") ?? "overview",
  empty = params.has("empty"),
  member = params.has("member");
const snapshot = {
  title:
    "A very long book title about an imaginary library and its collection of extraordinary stories",
  authors: ["An Author"],
  genres: [],
  contentWarnings: [],
  providerIdentifiers: {},
  provenance: [],
};
const read = {
  id: "read-1",
  clubId: "club-1",
  workSubjectType: "book",
  workSubjectId: null,
  candidateSnapshot: snapshot,
  status: "active",
  startDate: null,
  targetEndDate: null,
  completedAt: null,
  createdBy: "owner",
  selectionRoundId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
const item = {
  read,
  snapshot,
  workHref: null,
  readerHref: null,
  participantCount: 1,
  discussionCount: 1,
  journalCount: 1,
  averageRating: null,
  ratingCount: 0,
  recommendations: null,
  viewerProgress: null,
  progressPercent: null,
  progressLabel: null,
  caughtUp: null,
  viewerCheckedIn: false,
  caughtUpCount: 0,
  memberCount: 1,
  members: [{ userId: "owner", displayName: "Owner", checkedIn: false }],
  checkIn: null,
  schedule: [],
  discussions: [
    {
      id: "topic-1",
      kind: "discussion",
      label: "chapter 8",
      text: null,
      locked: true,
      author: "Owner",
      createdAt: new Date().toISOString(),
      href: null,
      unread: false,
    },
  ],
  journal: [],
  participants: [],
  rating: {
    coreValues: {},
    genreValues: {},
    trajectory: [],
    dimensions: [],
    scale: 5,
  },
  viewerRatingStatus: null,
};
const detail = {
  club: {
    id: "club-1",
    name: "A very long club name that needs to wrap cleanly on a small mobile screen",
    description: "A personal reading club.",
    visibility: "private",
    context: "book",
    memberCount: 1,
    createdAt: new Date().toISOString(),
    coverFileId: null,
  },
  members: [
    { userId: "owner", displayName: "Owner", username: "owner", role: "owner" },
  ],
  canEdit: !member,
  canModerate: !member,
  canAdmin: !member,
  isMember: true,
  canJoin: false,
  currentWork: null,
  readDefaults: { durationDays: 14 },
  selectionDefaults: {
    nominationDays: 7,
    votingDays: 7,
    nominationLimit: 2,
    method: "simple_poll",
    configuration: {
      tieBehavior: "moderator",
      resultVisibility: "after_completion",
      excludePreviouslyRead: false,
    },
  },
};
const scenario = params.get("scenario");
if (scenario === "many") {
  detail.members = Array.from({ length: 30 }, (_, i) => ({
    userId: String(i),
    displayName: "Reader " + i,
    username: "reader" + i,
    role: "member",
  }));
  detail.club.memberCount = 30;
  item.memberCount = 30;
  item.members = detail.members
    .slice(0, 8)
    .map((m) => ({ ...m, checkedIn: false }));
}
if (scenario === "canonical") {
  item.workHref = "/books/example" as never;
  item.readerHref = "/read/book/example" as never;
}
const selectionCandidates = Array.from(
  {
    length: { "many-candidates": 30, "ranked-many": 12 }[scenario ?? ""] ?? 1,
  },
  (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    workSubjectType: "book",
    workSubjectId: scenario === "external" ? null : `book-${index}`,
    snapshot: {
      ...snapshot,
      title: index
        ? `Candidate ${index + 1} with an intentionally long title for responsive ranking controls`
        : snapshot.title,
      hasContentWarnings: scenario === "warnings",
      pageCount: index ? 320 + index : undefined,
    },
    eligible: true,
    availableToRead: scenario === "canonical",
    nominationCount: 1,
    nominators: [
      { displayName: "Owner", reason: "A stored nomination reason." },
    ],
  }),
);
function selectionExperience() {
  const ranked = scenario?.includes("ranked"),
    random = scenario === "random" || scenario === "hybrid",
    complete =
      scenario === "completed" ||
      scenario === "up-next" ||
      scenario === "runoff",
    voting =
      ranked ||
      scenario === "simple" ||
      scenario === "submitted" ||
      scenario === "hidden" ||
      scenario === "voting-waiting" ||
      scenario === "voting-closed";
  const phase =
    scenario === "draft"
      ? "draft"
      : complete
        ? "completed"
        : voting
          ? "voting_open"
          : "nominations_open";
  return {
    id: "00000000-0000-4000-8000-000000000099",
    title: "The next very thoughtfully selected club read",
    phase,
    method: random ? "random_draw" : ranked ? "ranked_choice" : "simple_poll",
    nominationStartsAt: new Date(
      Date.now() + (scenario === "waiting" ? 86400000 : -86400000),
    ).toISOString(),
    nominationEndsAt:
      scenario === "waiting"
        ? new Date(Date.now() + 86400000).toISOString()
        : new Date(Date.now() + 172800000).toISOString(),
    votingStartsAt: voting
      ? new Date(
          Date.now() + (scenario === "voting-waiting" ? 86400000 : -86400000),
        ).toISOString()
      : new Date(Date.now() + 259200000).toISOString(),
    votingEndsAt:
      scenario === "voting-closed"
        ? new Date(Date.now() - 1000).toISOString()
        : new Date(Date.now() + 345600000).toISOString(),
    nextReadStartsAt: new Date(Date.now() + 604800000).toISOString(),
    nominationLimit: 2,
    configuration: {
      tieBehavior: "runoff",
      resultVisibility:
        scenario === "hidden" ? "after_completion" : "during_voting",
      excludePreviouslyRead: true,
    },
    source:
      scenario === "random"
        ? {
            name: "Book Club Backlog",
            ruleSummary: "(Genre = Fantasy OR Genre = Science Fiction)",
          }
        : null,
    candidateCount: selectionCandidates.length,
    eligibleCount: selectionCandidates.length,
    nominationCount: selectionCandidates.length,
    nominatorCount: 1,
    memberCount: 6,
    remainingNominations: scenario === "exhausted" ? 0 : 1,
    votedCount: scenario === "submitted" ? 4 : 2,
    viewerBallot:
      scenario === "submitted" || ranked
        ? selectionCandidates
            .slice(0, Math.min(4, selectionCandidates.length))
            .map((c) => c.id)
        : [],
    viewerChoices: selectionCandidates.map((c) => ({
      id: c.id,
      title: c.snapshot.title,
    })),
    canNominate: phase === "nominations_open" && scenario !== "exhausted",
    canVote: phase === "voting_open" && scenario !== "voting-closed" && !random,
    canModerate: !member,
    isMember: true,
    resultVisible: scenario !== "hidden",
    result: complete
      ? {
          winner: { id: selectionCandidates[0]!.id, snapshot },
          decidedAt: new Date().toISOString(),
          eligibleCount: selectionCandidates.length,
          clubReadId: scenario === "up-next" ? "read-1" : null,
          runoffRoundId: null,
          requiresTieResolution: false,
          tiedIds: [],
          tieResolution: null,
        }
      : scenario === "runoff"
        ? {
            winner: null,
            decidedAt: new Date().toISOString(),
            eligibleCount: 2,
            clubReadId: null,
            runoffRoundId: "00000000-0000-4000-8000-000000000098",
            requiresTieResolution: false,
            tiedIds: selectionCandidates.map((c) => c.id),
            tieResolution: "runoff",
          }
        : null,
    parentRoundId:
      scenario === "runoff-child"
        ? "00000000-0000-4000-8000-000000000097"
        : null,
    candidates: selectionCandidates,
    nextCursor: null,
  };
}
window.fetch = async (input) => {
  const url = String(input);
  let data: unknown = detail;
  if (url.endsWith("/upcoming"))
    data = [
      {
        id: "club_read_start:read-1",
        domain: "club",
        clubId: "club-1",
        clubReadId: "read-1",
        kind: "club_read_start",
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        label: `${detail.club.name} · ${snapshot.title} starts`,
        href: "/clubs/club-1/reads/read-1",
      },
      {
        id: "club_voting_close:round-1",
        domain: "club",
        clubId: "club-1",
        clubReadId: null,
        kind: "voting_close",
        startsAt: new Date(Date.now() + 172800000).toISOString(),
        label: `${detail.club.name} · Voting closes`,
        href: "/clubs/club-1/nominations",
      },
      {
        id: "movie_release:film-1",
        domain: "movie",
        kind: "movie_release",
        startsAt: new Date(Date.now() + 259200000).toISOString(),
        label: "A long film title arrives in the library",
        href: "/movies/film-1",
      },
    ];
  else if (url.includes("/members/experience"))
    data = {
      activeRead: empty ? null : { id: "read-1", title: snapshot.title },
      members: detail.members.map((person, index) => ({
        userId: person.userId,
        displayName: person.displayName,
        avatarUrl: null,
        joinedAt: new Date().toISOString(),
        progress: {
          state:
            index === 0 ? "finished" : index === 1 ? "reading" : "not_started",
          percent: index === 1 ? 68 : null,
          chapter: index === 1 ? 25 : null,
          page: null,
        },
        checkIn: empty ? null : index === 0 ? "caught_up" : "not_yet",
        readCount: 12 - index,
        completedCount: 11 - index,
      })),
    };
  else if (url.endsWith("/stats"))
    data = {
      since: new Date().toISOString(),
      summary: {
        reads: empty ? 0 : scenario === "one-read" ? 1 : 12,
        distinctWorks: scenario === "one-read" ? 1 : 11,
        rereads: scenario === "one-read" ? 0 : 1,
        knownPages: scenario === "one-read" ? 250 : 4830,
        pageCountKnown: scenario === "one-read" ? 1 : 10,
      },
      length: { median: 380, average: 402, shortest: 180, longest: 770 },
      pace: { medianDays: 29, averageDays: 32, datedReads: 10 },
      participation: {
        typicalParticipants: 5,
        participantOccurrences: 60,
        completedParticipantOccurrences: 50,
        checkInParticipantOccurrences: 40,
        discussionParticipantOccurrences: 42,
      },
      genres: Array.from(
        { length: scenario === "many-genres" ? 15 : 4 },
        (_, index) => ({
          name: index ? `A very long genre name ${index}` : "Fantasy",
          reads: Math.max(1, 7 - index),
        }),
      ),
      ratings: {
        average: scenario === "sparse-ratings" ? null : 4.2,
        count: scenario === "sparse-ratings" ? 0 : 36,
        distribution: [],
        coreValues:
          scenario === "rich-ratings"
            ? { story: 4.4, characters: 4.2, prose: 3.9 }
            : {},
        genreValues: {},
        trajectory:
          scenario === "rich-ratings"
            ? [
                { progress: 0, rating: 3 },
                { progress: 1, rating: 4.4 },
              ]
            : [],
        dimensions:
          scenario === "rich-ratings"
            ? ["story", "characters", "prose"].map((key, index) => ({
                id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
                key,
                scope: "core",
                name: key,
                description: null,
                enabled: true,
                displayOrder: index,
                required: false,
                contributesToRating: true,
                weight: 1,
              }))
            : [],
        genreDefinitions: [],
        scale: 5,
      },
      recommendations: { yes: 25, total: 34 },
      overTime:
        scenario === "one-read"
          ? [{ month: "2026-01", reads: 1 }]
          : [
              { month: "2026-01", reads: 1 },
              { month: "2026-02", reads: 2 },
            ],
      highlights: { highestRated: null, divisive: null },
    };
  else if (url.includes("/members/") && url.endsWith("/experience"))
    data = {
      member: {
        userId: url.match(/\/members\/([^/]+)\/experience/)?.[1] ?? "owner",
        displayName:
          detail.members.find(
            (person) =>
              person.userId ===
              (url.match(/\/members\/([^/]+)\/experience/)?.[1] ?? "owner"),
          )?.displayName ?? "Owner",
        avatarUrl: null,
        joinedAt: new Date().toISOString(),
        progress: {
          state: "finished",
          percent: 100,
          chapter: null,
          page: null,
        },
        checkIn: "caught_up",
        readCount: 12,
        completedCount: 11,
      },
      recentReads: [
        {
          id: "read-1",
          title: snapshot.title,
          completedAt: null,
          rating: null,
        },
      ],
      nextCursor: null,
      sharedPassages: 12,
      discussions: 18,
    };
  else if (url.includes("/topics/index"))
    data = {
      read: empty
        ? null
        : {
            id: "read-1",
            title: snapshot.title,
            status: view.includes("reads/") ? "completed" : "active",
          },
      progressLabel:
        scenario === "finished"
          ? "100%"
          : scenario === "middle"
            ? "Chapter 25"
            : null,
      groups: empty
        ? []
        : [
            {
              key: "general",
              label: "General",
              locked: false,
              topics: [
                {
                  id: "general-1",
                  title:
                    "A very long general discussion title that remains safe and wraps on mobile",
                  author: "A Reader",
                  unread: !url.includes("unread=true"),
                  replyCount: 2,
                  pinned: true,
                  closed: false,
                },
              ],
            },
            {
              key: "chapter",
              label: "chapter 2",
              locked: scenario !== "finished",
              topics: [
                {
                  id: "locked-1",
                  title:
                    scenario === "finished"
                      ? "A safe chapter discussion"
                      : null,
                  author: "A Reader",
                  unread: true,
                  replyCount: 5,
                  pinned: false,
                  closed: false,
                },
              ],
            },
          ],
      passages: empty
        ? []
        : [
            {
              id: "passage-1",
              label: "chapter 2",
              text:
                scenario === "finished" ? "A permitted shared snapshot." : null,
              locked: scenario !== "finished",
              authorUserId: "owner",
              authorDisplayName: "A Reader",
              canUnshare: !member,
            },
          ],
      nextCursor: null,
    };
  else if (url.endsWith("/overview"))
    data = {
      activeRead: empty ? null : item,
      selection: empty
        ? null
        : {
            id: "round-1",
            title: "Next read",
            phase:
              scenario === "voting"
                ? "voting_open"
                : scenario === "selected"
                  ? "completed"
                  : "nominations_open",
            method: "simple_poll",
            candidateCount: 0,
            nominatorCount: 0,
            votedCount: 0,
            remainingNominations: 2,
            winner: scenario === "selected" ? snapshot : null,
            nextReadStartsAt:
              scenario === "selected"
                ? new Date(Date.now() + 86400000).toISOString()
                : null,
            hasBallot: false,
            href: "/clubs/club-1/selection-rounds/round-1",
          },
      upcoming: [],
      recentActivity: [],
      lastRead: null,
    };
  else if (url.includes("/selection-rounds/experience"))
    data = scenario === "no-round" ? null : selectionExperience();
  else if (url.includes("/selection-candidates/search"))
    data = selectionCandidates.map((candidate) => ({
      id: candidate.workSubjectId,
      title: candidate.snapshot.title,
      authors: candidate.snapshot.authors,
      coverFileId: null,
    }));
  else if (url.includes("/candidates/"))
    data = {
      ...selectionCandidates[0],
      snapshot: {
        ...snapshot,
        description: "A stored candidate description.",
        contentWarnings:
          scenario === "warnings"
            ? [
                {
                  code: "violence",
                  provenance: { source: "user", sourceId: "owner" },
                },
              ]
            : [],
        provenance: [{ source: scenario === "external" ? "user" : "work" }],
      },
      workHref: scenario === "external" ? null : "/books/example",
      readerHref: scenario === "canonical" ? "/read/book/example" : null,
      warningSources: { owner: "Owner" },
    };
  else if (url.endsWith("/audit"))
    data = {
      method: "ranked_choice",
      winnerId: selectionCandidates[0].id,
      tiedIds: [],
      rounds: [
        {
          counts: Object.fromEntries(
            selectionCandidates
              .slice(0, 3)
              .map((candidate, index) => [candidate.id, 3 - index]),
          ),
          exhausted: 1,
          eliminated: selectionCandidates[2]?.id ?? null,
        },
      ],
      tieBreaks: [],
      decidedAt: new Date().toISOString(),
      configuration: {},
      eligibleCount: selectionCandidates.length,
      candidateTitles: Object.fromEntries(
        selectionCandidates.map((candidate) => [
          candidate.id,
          candidate.snapshot.title,
        ]),
      ),
    };
  else if (url.includes("/pool"))
    data = { candidates: selectionCandidates, nextCursor: null };
  else if (url.endsWith("/selection-rounds"))
    data = [
      {
        id: "00000000-0000-4000-8000-000000000099",
        title: "Previous selection",
        phase: "completed",
        createdAt: new Date().toISOString(),
        method: "ranked_choice",
        winnerTitle: snapshot.title,
        votedCount: 5,
        clubReadId: "read-1",
      },
    ];
  else if (url.endsWith("/experience"))
    data = { ...item, read: { ...read, status: "completed" } };
  else if (url.includes("/selection-rounds/"))
    data = {
      title: "Next read",
      phase: "nominations_open",
      method: "simple_poll",
      candidates: [],
      viewerBallot: [],
    };
  else if (url.endsWith("/library"))
    data = {
      reads: [{ ...item, read: { ...read, status: "completed" } }],
      nextCursor: null,
    };
  else if (
    url.endsWith("/invites") ||
    url.endsWith("/schedules") ||
    url.includes("/poll")
  )
    data = [];
  else if (url.includes("/schedule"))
    data = { current: null, upcoming: [], past: [] };
  if (url.includes("/topics/index")) {
    const room = data as {
      groups: {
        key: string;
        label: string;
        locked: boolean;
        topics: {
          id: string;
          title: string | null;
          author: string;
          unread: boolean;
          replyCount: number;
          pinned: boolean;
          closed: boolean;
        }[];
      }[];
      passages: unknown[];
      progressLabel: string | null;
    };
    if (scenario === "beginning") room.progressLabel = "0%";
    if (scenario === "no-shares") room.passages = [];
    if (scenario === "many-chapters")
      room.groups.push(
        ...Array.from({ length: 35 }, (_, i) => ({
          key: "chapter-" + i,
          label: "chapter " + (i + 3),
          locked: true,
          topics: Array.from({ length: i === 0 ? 8 : 1 }, (_, k) => ({
            id: "chapter-" + i + "-topic-" + k,
            title: null,
            author: "A Reader",
            unread: true,
            replyCount: k,
            pinned: false,
            closed: false,
          })),
        })),
      );
    if (url.includes("unread=true"))
      room.groups = room.groups.filter((group) => group.key !== "general");
  }
  return new Response(JSON.stringify({ data }), {
    headers: { "content-type": "application/json" },
  });
};
await i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: { en: { clubs, books, metadata, home } },
  interpolation: { escapeValue: false },
});
history.replaceState(
  {},
  "",
  view === "upcoming"
    ? "/" + location.search
    : "/clubs/club-1" +
        (view === "overview" ? "" : "/" + view) +
        location.search,
);
const route = view.startsWith("reads/")
  ? "read"
  : view.startsWith("selection-rounds/")
    ? "selection"
    : view;
import { Routes, Route } from "react-router";
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<HomeUpcoming />} />
      <Route
        path="/clubs/:id/*"
        element={<ClubDetailPage view={route as never} />}
      />
      <Route
        path="/clubs/:id/reads/:readId"
        element={<ClubDetailPage view="read" />}
      />
      <Route
        path="/clubs/:id/selection-rounds/:roundId"
        element={<ClubDetailPage view="selection" />}
      />
    </Routes>
  </BrowserRouter>,
);
