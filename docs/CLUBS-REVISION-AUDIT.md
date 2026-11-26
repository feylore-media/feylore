# Clubs revision audit

Design reference: [book_club_view.txt](book_club_view.txt). Requirements: the supplied Feylore Clubs Revision request.

This is the pre-implementation mapping. No runtime or database changes have been made.

| Existing schema / component | Decision | Revision approach |
| --- | --- | --- |
| `clubs`, `club_members`, `club_invites`; `ClubService` | Keep / extend | Preserve persistent groups, membership, invitations, visibility, and existing owner/moderator/member roles. Add defaults and delegated capabilities where required. |
| `club_works`; `ClubWorksService` | Keep / migrate read state | Keep media-capable Work associations. Introduce separate Club Read occurrences and backfill current/queued/completed associations. The existing unique club/type/Work index prevents rereads; read occurrences must not inherit that constraint. Preserve legacy endpoints during transition. |
| `club_schedules`, `club_schedule_occurrences`; `ClubScheduleService` | Extend | Retain recurrence, generated topics, timing, and consumption targets. Attach read-specific schedules/occurrences to a Club Read while preserving club-wide schedules. Existing schedules refer to `club_work_id`; occurrences carry Work references. |
| `club_occurrence_check_ins`; `ClubCheckInService` | Keep / extend | Preserve authenticated-user check-ins and occurrence identity. Resolve their read through the occurrence. Check-in declarations and personal reading progress remain separate. |
| `club_topics`, `club_posts`, reactions, mentions; `ClubDiscussionService` | Extend | Preserve discussions, replies, moderation, pinned/closed topics, reactions, and mentions. Add read identity and reusable locations for read-specific discussions; keep general club topics. |
| `ConsumptionTarget`, `ProgressLocator`, `ReadingLocator`, `club-spoiler.ts` | Keep / extend | Reuse existing chapter/page/episode boundaries and progress locators. Audit every response for spoiler content, including titles, feed summaries, quotes, and previews; client hiding alone does not satisfy the revision. |
| `club_quotes`; `ClubQuotesService` | Extend | Preserve explicit sharing and annotation ownership checks. Add Club Read, location, and spoiler boundary. Never populate shared content by listing another user's private annotations. |
| `club_polls`, `club_poll_options`, `club_poll_votes`; `ClubPollsService` | Migrate / reuse | Existing draft/active/closed/applied poll supports one vote per member and applies a winner to current Work. Evolve into selection rounds with independent nomination/voting phases, snapshot candidates, ballots, and persisted result explanations. Preserve existing polls/votes during migration. |
| `ClubPollDiscoveryService` | Keep / extend | Existing TBR/queued/library/manual discovery is reusable. Integrate Shelf rule machinery rather than adding a club filter language. External candidate references must not create canonical Works or require files. |
| `ClubOverviewService`, `ClubOverviewTab` | Extend | Existing endpoint aggregates current Work, check-ins, anchors, active poll, shared quotes, and viewer progress. Change to compact read/selection previews and add local events and last completed read. |
| `ClubCurrentWorkCard`, `ClubCurrentWork`, `ClubSchedulePanel`, check-in and quote components | Keep / refactor | Reuse existing visual primitives and reading affordances for Current Read and Overview. Reuse canonical Book detail components for metadata rather than cloning the Book page. |
| `ClubDetailPage`, `ClubHeader`, router | Extend / reorganize | Current tabs are Overview, Activity, Members, Settings; topic details have their own route. Add Overview, Current Read, Discussions, Nominations, Library, Members, Stats with navigable routes. Keep Settings as a separate permission-gated action; move invitations/role changes/member removal there. |
| `ClubFeed`, discussion anchor components | Extend | Preserve existing activity and schedule-based discussion navigation. Add progress-safe read activity and location grouping without exposing future content. |
| `clubs.module.css`, `locales/en/clubs.json` | Keep / extend | Retain semantic tokens, Solar Icons, domain strings, dark-first styling, and mobile patterns. Mockup data is illustrative and must not become fabricated UI state. |
| `worker-sweep.ts` | Extend / integrate | Existing schedule tick runs immediately and hourly with failure handling. Add recoverable deadline transitions through established job infrastructure; manual transitions remain supported. |
| Existing club tests | Keep / extend | Existing API/service tests cover clubs, works, schedules, check-ins, discussion anchors, overview, quotes, spoilers, and poll discovery. Add reread/history, lifecycle/deadline/limit, election, external snapshot, privacy, authorization, and completed-read aggregate coverage. |

## Authorization and API baseline

Global permissions are `clubs.read`, `clubs.write`, and `club.publish`. `ClubService.requireView` guards visibility; `canModerate` grants club administration to owners/moderators and `canAdmin` handles owner-level operations. Detail responses expose `canEdit`, `canModerate`, and `canAdmin`; these are presentation hints, with service checks remaining authoritative.

`src/server/http/clubs-routes.ts` owns existing `/clubs/:id` routes for detail, membership, invitations, works, schedules, discussions, check-ins, overview, polls, and quotes. Extend this established Fastify/Zod/service boundary; nomination and ballot owners must come from authenticated context.

## Pass boundary

Clubs owns membership coordination, read occurrences, selection rounds, shared discussion material, and derived club events/aggregates. It consumes canonical Works, authorization, user progress/ratings, annotation ownership, metadata providers, Shelf rules, storage/artwork, and jobs. It must not own or mutate personal progress/ratings, private Journal content, files, or canonical metadata merely because a candidate is nominated.

Club APIs expose authorized read history, safe previews, selection participation/results, and events that can feed Upcoming. Offline library reading remains the reader/download system's responsibility; this revision must preserve existing access and avoid treating club membership as file authorization.

## Scope resolved - September 15, 2026

The user promoted the requested Clubs revision into V1. V1-SCOPE.md now records that decision. Club Reads and Selection Rounds are separate first-class entities; retain legacy Work associations and poll data; general topics and club-wide schedules need no read; check-ins never change personal progress; server responses enforce spoiler boundaries; external winning candidates may become scheduled reads without a file or canonical Work; warnings use common metadata/provenance; stats derive from authoritative user ratings. External calendar synchronization and a general analytics platform remain later scope.
