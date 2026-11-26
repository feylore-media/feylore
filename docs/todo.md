# Feylore — V1 Implementation Passes

**Last updated:** 2026-09-10

**Product authority:** [V1-SCOPE.md](./V1-SCOPE.md)

**Execution tracker:** This file maps V1-SCOPE sections to ordered implementation passes, tracks status, and records acceptance criteria. When this order differs from V1-SCOPE §29 (e.g. Playback before Audiobooks), this file is authoritative for sequencing.

**Deferred implementation notes:** [deffered_scopes.md](./deffered_scopes.md)

**Current focus:** Relationships dependency pass, then Pass 11 — TTRPG

**Platform note:** V1 is under-developed in the platform layer (Users, Admin, identity, security, privacy, operational controls), not because it lacks more media modules. Passes 11–18 disproportionately strengthen that layer.

**Baseline repo debt (2026-09-18 checkpoint):** Notifications 1.1 completion rerun. Full-suite failure classes beyond the notification scope are pre-existing and recorded here as debt, not chased: (a) typecheck errors in Books metadata-edit (`MetadataCanonicalFieldRow.tsx`, `useBookMetadataEditor.ts` — string not assignable to canonical field literal union) and older test-contract errors in `tests/club-quotes-api.test.ts`, `tests/people-credits.test.ts`, `tests/processing-policy-api.test.ts`, `tests/reading-progress-sync.test.ts`; (b) ESLint errors in `ingest-routes.ts`, `routes.ts` (server), `downloads/service.ts`, `ingest/processors/movies.ts`, `podcasts/service.ts`, `representations/service.ts`, `shelves/service.ts`, shared `admin-search.ts`, `goal-registry.ts`, `plain-text.ts`, `processing-templates.ts`, `shelf-rule-fields.ts`, `shelf-sort.ts`, web `GoalPages.tsx`, and tests `activity.test.ts`, `club-works.test.ts`, `ingest-upload.test.ts`, `podcasts-prepare.test.ts`, `shelves.test.ts` (unused imports/vars). Notification-scoped tests (25) and changed-file lint/typecheck are clean. The project-wide build is separately known to stop at Readium CSS name-mangling (see CLUBS-REVISION-IMPLEMENTATION.md). Notifications 1.2 rerun on the same date left this baseline unchanged: typecheck still reports exactly the same set, scoped notification suites grew to 37 passing tests, and all 1.2 files are lint-clean. `drizzle-kit generate` also cannot resolve the repo's `.js`-style relative imports (`Cannot find module ../../shared/profile-cosmetics.js`), which predates this pass; migrations are hand-written and journaled (see `drizzle/meta/_journal.json`), as they have been since migration 0008. The 1.3 (email channel) rerun left the baseline unchanged again — typecheck/lint identical, scoped notification suites grew to 50 passing tests, and 1.3 required no migration (the `email_enabled` column predates it).

---

## Pass 1 — Foundation platform

**V1-SCOPE:** §2 Foundation

- [x] Web/API/DB stack, migrations, seed, config, health, error handling
- [x] Session auth, roles, permission-based authorization
- [x] OIDC authentication
- [x] OIDC provider configuration and account linking
- [ ] Secure session lifecycle, CSRF protection, cookie/security headers
- [ ] Rate limiting and abuse protection for authentication and sensitive endpoints
- [ ] SSRF protection for remote metadata/feed/import URLs
- [x] Path traversal / filesystem boundary validation
- [ ] Secure upload and file-type validation
- [x] Storage abstraction, libraries, ingest roots, file discovery and association
- [x] pg-boss jobs, metadata provider contract and registry
- [x] Postgres FTS search backend, download abstraction, PWA shell, i18n structure
- [ ] Security audit of authorization boundaries and object-level access
- [ ] Audit/event foundation for security-sensitive administrative actions

---

## Pass 2 — Books module

**V1-SCOPE:** §4 Books, §22 Reading (EPUB), §16 User state (books)

- [x] Books domain model, browse/detail/edit, ingest processor, library membership
- [x] EPUB reader ([READER.md](./READER.md)): session/adapter, preferences, Media Overlays, bookmarks, annotations, progress
- [x] Metadata ingest, OPF extraction, cover pipeline, user overrides and provenance
- [x] Book downloads (`download.prepare`), downloads page, offline boundary for reader
- [x] Shelves (basic membership, drag-and-drop), books search/import/shelves tests
- [x] Correct ratings to the five-step popout modal: Core Rating → Genre Ratings → Trajectory + Recommendation → Suggested Rating + Summary → Review + Post/Save. Targeted tests/browser checks pass; remaining project-wide validation limitations are recorded in [RATINGS-PLAN.md](./RATINGS-PLAN.md).

---

## Pass 3 — Core UX

**V1-SCOPE:** §2 Foundation gaps (activity, search UX, auth account management, job handlers)

Infrastructure/UX rather than social functionality.

- [x] Activity emission and feed UI; ingest activity remains separate
- [x] Global search UI with book result enrichment (`slug`, `href`)
- [x] Account, language, and devices settings pages; profile and password APIs
- [x] Real job handlers: `artwork.fetch`, `search.index`; explicit `media.process` failure until domain processors exist

---

## Pass 4 — Playback foundation

**V1-SCOPE:** §21 Playback, §16 User state (listening progress)

- [x] Shared playback architecture for audio (and later video) domains
- [x] Play/pause, seek, queue, current item, progress persistence and resume
- [x] Playback history hooks integrated with user state (distinct from metadata)
- [x] Mobile/background playback baseline; audio and video UI may diverge where appropriate
- [x] `media.process` job handler extended as the domain processor registration point

---

## Pass 5 — Home

**V1-SCOPE:** §3 Home

- [x] Personalized home for the current user (not a statistics dashboard)
- [x] Continue reading, recently added, recently finished, favorites, recent activity, library shortcuts
- [x] Sensible empty/welcome state when the library has little or no data
- [x] Modular layout that can absorb continue listening/watching as domains arrive

---

## Pass 6 — Audiobooks

**V1-SCOPE:** §7 Audiobooks

- [x] Audiobooks as a first-class domain (not an audio file on a Book Work)
- [x] Ingest processor, browse/detail, metadata (e.g. Audible provider), artwork
- [x] Playback integration via Pass 4; listening progress, history, favorites, ratings
- [x] Search indexing and downloads/offline playback
- [x] Optional relationship to related book Works without shared deletion

---

## Pass 7 — Podcasts

**V1-SCOPE:** §8 Podcasts

- [x] Podcast feeds, shows, and episodes on shared audio infrastructure
- [x] Episode metadata, artwork, subscriptions/follows, playback, progress, history
- [x] Downloads and offline playback (prepare → representation → download pipeline)
- [x] Under Audiobooks/audio experience — not a separate primary sidebar module

---

## Pass 8 — Music

**V1-SCOPE:** §9 Music

- [x] Artists, albums, tracks, genres; distinct domain model (not books or generic files)
- [x] Playlists, favorites, queue, playback history, search/filter/sort
- [x] Artwork, metadata, external identifiers, downloads/offline playback

---

## Pass 9 — Movies

**V1-SCOPE:** §10 Movies

- [x] Movie domain: metadata, artwork, people/cast/crew where supported, collections
- [x] Playback, watch progress/history, favorites, ratings, search, downloads/offline

---

## Pass 9.1 — Creative identity (People)

Shared canonical identity for authors, narrators, artists, cast/crew, and other creative entities (`person` \| `group` \| `organization`). Media-contextual discovery; single canonical profile at `/people/:slug`; no top-level People navigation item.

- [x] `people` / `person_credits` / `person_provider_identifiers` / `person_relationships` schema + migration
- [x] `PeopleService` (list, profile, media-contextual grids, batch resolution, credits)
- [x] API: `/people`, `/people/:slug`, `/books/authors/people`, `/audiobooks/authors/people`, `/audiobooks/narrators/people`, `/music/artists/people`, `/movies/people/list`
- [x] Canonical profile page and contextual grid pages with alphabet nav + pagination
- [x] People links from existing Books/Audiobooks/Music author/narrator/artist pages
- [x] Books/Audiobooks/Music author surfaces consume the People graph: author/narrator/artist resolution into `person_credits` on write (role-scoped), `people_id` linkage on `book_authors` / `audiobook_authors` / `audiobook_narrators` / `music_artists`, detail responses expose `peopleSlug`, author/narrator pages rebuilt on the People grid
- [x] Idempotent backfill for existing book/audiobook/music credits (`src/server/db/backfill-people.ts`)
- [x] Credit-sync integration tests (`tests/people-credits.test.ts`)
- [ ] Search indexing (`person:` qualifier) for people entities
- [x] People editing authorization + API behavior tests (`tests/people-metadata-edit.test.ts`)

## Pass 9.2 — People editing surface

Person metadata editing at `/people/:slug/edit`, reusing the shared metadata surface (overrides-as-locks, provenance, provider records, evidence-only fetch jobs) and the Book metadata editor interaction model. Requires `people.write`.

- [x] `people` media module + canonical person fields (shared canonical registry tagged `people`) + `entityType` enum / `peopleLinks` schema (`drizzle/0030_people_edit.sql`)
- [x] Field kinds/specs + shared schemas (`person-metadata-field-kinds.ts`, `person-metadata-editor.ts`)
- [x] `PersonCanonicalService` (person-specific mirror of `MetadataCanonicalService`; no auto-merge), `person-metadata-editor` builder (three-state matrix), `PeopleService` write methods (links, identifiers, removeCredit, duplicate candidates, directional merge `mergePersonInto`)
- [x] Wikidata provider (`src/providers/wikidata`) registered in the standard provider registry; auto-enabled; QID/name resolution, label batch fetch, Commons portrait URL, QID identifier
- [x] Evidence-only person metadata fetch job (`metadata.person.fetch`) with active-job guard, task key/labels, worker + context wiring
- [x] Portrait adoption endpoint (SSRF-safe download → managed storage → `photoFileId` + provenance); direct `photo` field writes rejected
- [x] Route surface: editor GET, single/bulk field PATCH, lock PATCH, field DELETE, fetch POST, photos adopt/delete, identity PATCH, links CRUD, identifiers POST/DELETE, duplicates GET, merge POST, credit DELETE
- [x] UI: matrix editor generalization (`kindOf` + structural data prop), `usePersonMetadataEditor`/`usePersonMetadataFetch`, `PeopleEditPage`, router + edit link + `people` i18n namespace
- [x] Tests: registry unit test + API behavior/authorization tests (`tests/people-metadata-edit.test.ts`, `tests/person-canonical-field-kinds.test.ts`)
- [x] Docs: `docs/People.txt`, `MEDIA-MODEL.md`, `API.md`
- [x] Links/identifiers/merge editing UI (`PeopleEditIdentitySections`: links CRUD, provider-identifier add/remove, duplicate candidates + confirm merge on `/people/:slug/edit`) (`src/web/components/people/PeopleEditIdentitySections.tsx`)

## Pass 9.3 — People profile view (library-only, `docs/Individual.txt`)

Rework `/people/:slug` to match the revised `docs/Individual.txt`: a profile is a view into the user's library only. No non-library works, no arbitrary credit creation, no fabricated library URLs, no external-bibliography content. Sections per media tab: Last published → series groups → other works → all works grid. Duplicates/merge remain backend endpoints (future administrative task), not part of the individual page.

- [x] Migration `0031_person_credits_external.sql` (experimental non-library credit columns) applied, then rolled back additively by `0032_remove_person_credit_external.sql` (delete null-target credits, full unique index `(people_id, target_type, target_id, role)`, `target_id NOT NULL`, drop `title`/`external_url`/`external_label`/`release_date`)
- [x] Shared types: `PeopleCreditItem` is library-only (`targetId` non-null, no `inLibrary`/external fields); `PeopleEntityProfile` returns `links` + full `credits`; removed `personCreditInputSchema` / `personCreditPatchSchema`
- [x] `PeopleService`: `buildCreditItems` joins books/audiobooks/movies/albums, resolves series membership and release dates (book/audiobook provider payloads `publicationDate`/`releaseDate`, movie/album `release_date`), and drops credits that no longer resolve to a library row; removed credit CRUD (`listCredits`/`addPersonCredit`/`updatePersonCredit`/`deletePersonCredit`); `mergePersonInto` revert to library-only credit copy
- [x] Routes: removed `GET/POST /people/:slug/credits` and `PATCH/DELETE /people/:slug/credits/:creditId`; kept `DELETE /people/:slug/credits/:targetType/:targetId`, `GET /people/:slug/duplicates`, `POST /people/:slug/merge`
- [x] Profile page rebuild (`PeopleEntityPage`): links column, derived role labels, bio expander, Fetch Metadata button, per-media tabs, Last published → Series → Other works → All works grid; no upcoming band (no provider emits upcoming data); dates never fabricated
- [x] Removed Works & credits editing section (`PeopleEditCreditsSection`) and the Find duplicates & merge section from `/people/:slug/edit`
- [x] Tests: removed `tests/people-credits-editing.test.ts`; `tests/people-credits.test.ts` + `tests/people-metadata-edit.test.ts` remain (profile assembly + merge endpoint)
- [x] Docs: `docs/People.txt`, `MEDIA-MODEL.md`, `API.md`

---

## Pass 10 — TV and Live TV

**V1-SCOPE:** §11 Television, §12 Live TV

- [x] Show → Season → Episode hierarchy, metadata, artwork, episode progress/history
- [x] Continue watching / next episode / season-show derived progress
- [x] Live TV under `/tv/live` with M3U import and bounded HLS playback
- [x] Shared Home Continue Watching shelf (movies + TV episodes)
- [x] Downloads via shared representation-based download system

---

## Pass 10.5 — Shared Relationships dependency

**V1-SCOPE:** §14 TTRPG prerequisite. [Implementation plan](./RELATIONSHIPS-PEOPLE-IMPLEMENTATION.md). Keep this pass limited to the service and read model TTRPG needs; People Passes 9.1–9.3 remain complete.

- [x] Inventory `creative_work_relationships`, `person_relationships`, People credits, and Book/Audiobook Series membership; decide authority and migration/backfill
- [x] Typed relationship registry and service, preserving the existing Book ↔ Audiobook `related_edition` predicate
- [x] Bounded, group-selective Related read projection over relationships, People credits, Series, and Representations, independent of Shelf membership
- [x] Library visibility filtering, bidirectional reads, pagination, and counts without target hydration
- [x] High-connectivity fixture and query-count/performance gates for Work, Person, and Series queries (25 direct links: semantic ≤5 SQL statements; all Related groups ≤11; `limit=10` ≤250 ms)
- [x] Relationship API regression coverage: bidirectional Book ↔ Audiobook resolution, inaccessible-target filtering, group selection, and 25-link pagination
- [ ] API/domain/authorization tests, typecheck, lint, build, and documentation for delivered slices — repository-wide baseline failures are documented separately; focused relationship API tests and lint pass

---

## Pass 11 — TTRPG

**V1-SCOPE:** §14 TTRPG

**Prerequisite:** Pass 10.5 shared relationship service and Related read projection. TTRPG adds the predicates its resources require. Cross-domain Shelves handle curated groupings; Shelf showcase presentation, rich generic Related UI, and a relationship editor are deferred.

Deliberately small: classification, metadata, resource types, browse/filtering, and campaign view. Campaign view establishes architecture that Clubs can build upon — not a social system.

- [ ] TTRPG materials represented through existing library items rather than a separate media domain
- [ ] TTRPG classification/context for books, PDFs, and other supported library materials
- [ ] TTRPG metadata: system, series, publisher, edition, tags
- [ ] TTRPG-specific browse/filtering
- [ ] TTRPG resource types/sections: adventures, rules, supplements, maps, handouts, bestiaries, setting/reference, etc.
- [ ] Campaign view for organizing library items into campaigns
- [ ] Assign existing library items to one or more campaigns
- [ ] Campaign-specific ordering/sections
- [ ] Campaign resource view
- [ ] Prepare campaign architecture for Clubs integration
- [ ] TTRPG-specific metadata sources

---

## Pass 12 — Clubs

**V1-SCOPE:** §15 Clubs

Clubs are a first-class social container. Domain-specific behavior (book club, watch club, TTRPG campaign) sits inside the club as context/template, not as separate entities.

**Architectural model:**

- **Club** — persistent asynchronous group
- **Topic** — asynchronous conversation (optionally tied to a work/media item)
- **Schedule** — shared consumption target; recurring schedules generate discussion topics
- **Session** — temporary synchronous activity launched from a club (watch party, listen-together)

- [x] Clubs as a first-class social grouping of users
- [x] Public/joinable and private/invite-only clubs
- [x] Club ownership and basic member roles (owner, moderator, member)
- [x] Club membership management: join, leave, invite
- [x] Club profile: name, description, cover, members
- [x] Persistent asynchronous club feed
- [x] Discussion topics and replies
- [x] Pinned/closed topics
- [x] Basic announcements
- [x] Basic moderation
- [x] Basic reactions and @mentions in discussion
- [x] Clubs can optionally be oriented around a media domain (general, book, video/watch, TTRPG campaign)
- [x] Book/video clubs can associate works with the club
- [x] Recurring and one-off consumption schedules (frequency, consumption target, discussion topic generation)
- [x] Members can see current/upcoming club schedule
- [ ] Club owner/moderator can initiate a watch party from the club
- [ ] Club owner/moderator can initiate a listen-together session from the club
- [ ] TTRPG campaigns use Clubs as their persistent asynchronous campaign space

### Pass 12.1 — Club Work Selection

**V1-SCOPE:** §15 Clubs (work selection)

- [x] Club owner/moderator can select the club’s next work directly (`ClubCurrentWork`, `ClubWorkPicker`, `PATCH /clubs/:id/works/:workId`)
- [x] Club owner can create a poll to select the next work (`ClubPollManager`, `POST /clubs/:id/polls`)
- [x] Poll candidate discovery can use club/member context:
  - [x] Members’ TBRs (manual shelf items only — not inferred from missing progress), including intersection and popularity/ranking
  - [x] Club queued/associated works and member library availability (low-ranked weak source)
  - [ ] Metadata filters such as genre, tag, author, format, and length
  - [x] Availability to club members (library membership intersection)
  - [x] Exclude current/completed club works from discovery
- [x] Owner can review, remove, and manually add candidates before publishing a poll
- [x] Members can vote on active polls (`ClubWhatsNextPoll`, `POST /clubs/:id/polls/:pollId/votes`)
- [x] Poll result can become the club’s selected/current work (`POST /clubs/:id/polls/:pollId/apply-result`)
- [x] Selected work can be changed by the owner without a poll
- [x] Work selection does not require the work to already be in the club when manually added (library record still required)
- [x] Design the selection model so it can support books, video, and TTRPG works without domain-specific club logic (books/video done; TTRPG pending Pass 11)

### Pass 12.2 — Club Detail Page Redesign

**V1-SCOPE:** §15 Clubs (consumption-first overview)

- [x] Overview as default; Current Read, Discussions, Nominations, Library, Members and Stats as primary tabs; Settings as an administrative action; Activity retained as a compatibility route
- [x] `ClubHeader` and consumption-first overview layout (work + check-in pair)
- [x] Member check-in against current schedule occurrence (`GET /clubs/:id/check-in`, occurrence check-in toggle)
- [x] Discussion anchors on overview (anchor ≠ topic; lazy topic creation; view-all dialog)
- [x] Spoiler-aware discussion (structured post bodies, progress-based auto-hide when reliable)
- [x] “What’s Next?” poll section on overview when an active poll exists
- [x] Club quotes section on overview (book clubs only; explicit share from own annotations)
- [x] `GET /clubs/:id/overview` thin aggregation for the overview tab

### Pass 12.3 — Clubs Revision

The revision supersedes the legacy poll and Club detail navigation notes above. Its implementation and known limits are recorded in [CLUBS-REVISION-IMPLEMENTATION.md](CLUBS-REVISION-IMPLEMENTATION.md).

- [x] Occurrence-based Club Reads, rereads, external reads, read history, and Current Read
- [x] Progress-safe Discussions and explicit Journal sharing
- [x] Selection Rounds with simple, ranked-choice and auditable random results
- [x] Member presence and derived Stats
- [x] Settings administration and future-round/read defaults
- [x] Recoverable worker transitions across missed deadlines
- [x] Shared Club event projection for Overview and global Upcoming
- [x] Legacy poll and `club_works` authority boundaries reviewed
- [x] Add non-Club dated event providers to global Upcoming when those domains define authoritative event sources (implemented as Pass 15.5 Calendar; see docs/CALENDAR.md)

---

## Pass 13 — Users

**V1-SCOPE:** §16 User state, §26 Settings, portions of §18 Social

Establish the canonical Feylore user as the stable owner of identity, authentication, profile, personal preferences, devices, and user-specific state. The core user model must remain independent of individual media modules.

/settings remains personal-only. It must not become a dumping ground for global configuration.

Profile URL uses `username` as the slug: `/u/:username`. `@username` is display-only in UI; `@` is not part of the URL. Display name is separate from username.

- [x] Username validation and shared rules (`src/shared/username.ts`)
- [x] Profile fields: bio, avatar, visibility (default `public`), `profileJson` extension point
- [x] Public profile page at `/u/:username`
- [x] Profile API: `GET /profiles/:username`, `PATCH /auth/me`, `PATCH /auth/me/username`
- [x] Device settings/state (`devices.settingsJson`, `devices.stateJson`) distinct from `user_preferences`
- [x] Device rename, settings PATCH, state PUT, revoke cascades sessions
- [x] Complete user model and lifecycle
- [x] User identity/authentication state
- [x] OIDC-linked identities
- [x] Password authentication where enabled
- [x] Account linking/unlinking
- [x] Session/device management
- [x] Password change
- [x] Account recovery
- [ ] User preferences
  - [ ] General preferences (`libraryView`, `librarySort`, `settingsJson` — schema only; no settings UI yet)
  - [x] Language
  - [x] Appearance
  - [x] Personal privacy settings
  - [x] Notification preferences (per-type In-app toggles and Pause control in Settings — Notifications 1.2)
- [x] Notification delivery backend and product surface (1.0 + 1.1 + 1.2 + 1.3)
  - [x] Schema: `notification_types`, `user_notification_preferences`, `notifications`
  - [x] Stable notification type registry in `src/shared/notifications.ts`
  - [x] Domain event bus + notification sources (features emit events, sources render drafts)
  - [x] Notification service (recipient resolution, dedupe, aggregation, read/seen, preferences)
  - [x] API: `GET/PATCH /settings/notifications`, `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `POST /notifications/:id/seen`, `POST /admin/notifications`
  - [x] Initial `club.mention` source wired to club discussion mention events
  - [x] Header unread badge (9+/99+ caps), account popover preview (5 newest), seen-on-open
  - [x] `/notifications` page: cursor pagination, day grouping, mark read on activation, mark all read, empty/loading/error states
  - [x] Shared presentation layer (`notification-display.ts`) + shared row (`NotificationItem.tsx`); `actorAvatarUrl` on the public contract
  - [x] Focused tests: `tests/notifications.test.ts`, `tests/notification-display.test.ts`
  - [x] Notifications 1.2: Settings → Notifications page (catalog-driven category groups, per-type In-app toggles, Save)
  - [x] Top-level Pause notifications control (`user_preferences.notifications_paused`, migration `0050`); paused recipients skipped on delivery except future `mandatory` types
  - [x] `GET/PATCH /settings/notifications` return/accept `paused` alongside `preferences`; empty-body rejection
  - [x] 1.2 tests: settings API + pause delivery suppression + pure helpers (`tests/notification-settings.test.ts`)
  - [x] Notifications 1.3 (email delivery channel): `notification.email` pg-boss job; fresh-insert dispatch hook (`NotificationChannelService` injected into `NotificationService`)
  - [x] `PgBossEmailChannel` gates on SMTP availability + per-user `user_notification_preferences.email_enabled` (no schema change — column existed since foundation)
  - [x] `runNotificationEmail` worker + pure `renderNotificationEmail` (APP_URL links, HTML escaping); `MailService.send` generalized
  - [x] Settings UI gains per-type **Email** toggles (disabled when `emailAvailable: false`); opted-in names/descriptions + single global unavailable notice, pause card separated from the type matrix, aligned In-app/Email row columns
  - [x] i18n namespace fix: settings-page label helpers look up `notifications:` keys explicitly (bare keys leaked `categorySystem`/`typeSystemName` against the multi-namespace `t`)
  - [x] 1.3 tests: settings email persistence + rejection, channel dispatch gating, renderer, worker handler (`tests/notification-email-channel.test.ts`)
- [x] Device management
  - [x] Registered devices
  - [x] Device identification/name
  - [ ] Device-specific settings (API exists; no settings UI yet)
  - [ ] Device-specific state where required (API exists; no frontend consumer yet)
  - [x] Ability to revoke a device/session
- [x] Personal state isolation
  - [x] Establish user ownership boundaries
  - [x] Establish user-specific state extension points for modules
  - [x] Do not embed individual media modules into the core User model
- [x] Profile/social foundation
  - [x] Public vs private profile data
  - [x] Public user identity suitable for future social features
  - [x] Foundation for future activity, collections, statistics, and module contributions
  - [x] Clear distinction between personal settings and global administration

---

## Pass 14 — Administration

**V1-SCOPE:** §25 Administration

`/admin` is the operational control plane for the installation. Any administrative permission grants access to `/admin`; individual sections are independently permission-gated.

- [x] `/admin` permission-filtered navigation
- [x] Route-level permission guards
- [x] Users: creation, editing, disabling, deletion
- [x] Roles and permissions; user-role assignment
- [x] Libraries: configuration, ingest roots, storage configuration (Storage page: mounted storage + ingest sources; no separate Library admin)
- [x] Scans and ingest/processing status (Jobs API filtering; activity ingest UI; no Scans/Processing admin pages)
- [x] Jobs: failed/retryable jobs
- [ ] Metadata providers and provider configuration
- [ ] Integrations
- [x] Global application configuration
- [ ] System status/health
- [ ] Administrative audit log
- [ ] Dangerous-action confirmations
- [ ] Appropriate bulk operations
- [ ] Admin-facing error/status reporting

---

## Pass 15 — Security, privacy and identity hardening

**V1-SCOPE:** §24 Privacy and security

Release gate — not optional polish.

- [x] Complete OIDC flow testing
- [ ] Authorization matrix testing
- [ ] Object-level authorization testing
- [ ] Cross-user data isolation testing
- [ ] Admin permission-boundary testing
- [ ] Session invalidation/revocation
- [ ] CSRF protection verification
- [ ] Rate-limit verification
- [ ] SSRF protection verification
- [ ] Filesystem/path boundary verification
- [ ] Upload validation
- [ ] Remote-resource validation
- [ ] Sensitive information exposure review
- [ ] Privacy defaults
- [ ] Activity visibility controls
- [ ] User-data deletion behavior
- [ ] Audit logging for security-sensitive actions
- [ ] Security regression tests

---

## Pass 15.5 — Calendar and Upcoming

**V1-SCOPE:** §4 "Calendar / Upcoming" product structure (single authorized calendar; docs/CALENDAR.md)

- [x] Single-authorized-calendar architecture: one personal calendar per user, no public/follow model
- [x] Canonical `UpcomingEvent` model (`src/shared/upcoming.ts`) and server calendar module (`src/server/modules/calendar`)
- [x] Date parsing with precision (day/month/year/season/TBA); never fabricate a release day
- [x] Library sources: books, audiobooks, music, movies, TV (premiere + episodes), podcasts, and clubs
- [x] Internal metadata (`getUpcomingInternal`) and user field overrides (`publicationDate`/`releaseDate`) win over provider payloads
- [x] "My Calendar" source/reason dimension separate from per-domain media filters
- [x] Per-user calendar preferences (`GET/PUT /api/v1/calendar/preferences`) stored in `user_preferences.settings_json`
- [x] `/api/v1/calendar` windowed listing with media/sources filters and window clamping
- [x] `/api/v1/upcoming` Home compatibility path
- [x] Calendar page at `/calendar`: Agenda (default) and Month views, artwork preview popovers, domain + source filters, day sheets
- [x] URL state (`view`, `month`, `media`, `sources`) and preference persistence
- [x] Calendar API tests (10 tests, `tests/calendar-api.test.ts`) incl. override-wins, no-fabricated-day, media filters, club source, prefs round-trip, upcoming compat, window clamp
- [x] `docs/CALENDAR.md` — scope, sources, model, decisions, invariants
- [ ] Follow/followed-calendar notifications, saved searches, subscriptions, iCal/RSS, Wishlist — explicitly deferred beyond first pass

---

## Pass 15.6 — Shared Goals and Challenge Rules Engine

**Design intent:** shared cross-domain rule evaluation for Goals, dynamic Shelves, Challenges, and future smart-collection features.

- [x] Shared rule expression schema and predicate registry with `group` / `predicate` nodes, `and` / `or` composition, and domain-aware field/operator legality
- [x] Goal model: identity, target, metric, activity, visibility, period, aggregation, and eligibility rules
- [x] Domain-aware metric registry covering books, audiobooks, podcasts, music, movies, TV, and cross-media bag-of-hours / bag-of-works metrics
- [x] Aggregation contract for count, sum, and distinct-count goals; count is the first evaluated implementation
- [ ] Explicit unknown-handling for sensitive creator metadata; no inferred values for gender, ethnicity, nationality, sexual orientation, etc.
- [x] Goal templates for annual reading, TBR, genre, creator, around-the-world, screen, listening, and custom aims
- [x] Capability-driven Goal Builder with progressive conditions and live eligibility preview
- [x] Shared goal evaluator for period eligibility, nested rule explanations, and Work-level count identity
- [ ] Challenge model built as curated structure over the same goal/rule primitives rather than a separate parallel system
- [x] Goal CRUD/progress API, access-control, metric applicability, and focused evaluator regression tests

**Goals 1.2 boundary:** authoritative evaluation currently supports completed reading and finished listening candidates with `count` aggregation. Sum metrics and domain-specific candidate providers remain follow-up work; their aggregation shapes are persisted now so the goal model does not need to be redesigned.

**Goals 1.3 boundary:** metric/dimension definitions, provider-based candidate discovery, capability discovery, registry-backed sum/distinct aggregation, missing contribution reporting, and Work/canonical-person identity support are implemented. The first provider basis is `completed`; consumed-session providers and richer domain metadata remain the next extension before the editor pass.

**Goals 1.4 boundary:** capability-driven builder, conditional rule controls, draft eligibility preview, Goals overview/detail routes, progress history presentation, counted candidates, and exclusion explanations are implemented. Challenges, consumed-session providers, and broader Movie/TV/Podcast/Music candidate providers remain deferred to 1.5.

**Goals 1.5 boundary:** completed providers for Movies, TV episodes, Podcast episodes, and Music albums are implemented. TV counts episode identity; Music intentionally stops at completed albums. Goal editing reuses the creation builder, progress exposes derived lifecycle and milestone state, and cross-media builder choices are available. Consumed sessions, TTRPG activity, Challenges/Bingo, sharing/cloning, streaks, Wrapped, and goal recommendations remain deferred.

**Goals 1.6 boundary:** visible goals now integrate into viewer-aware profiles, goal wording is centralized, milestone activity is idempotent by goal/milestone, and profile/detail surfaces expose derived lifecycle and completion progress. Challenges remain objective definitions over these shared primitives rather than hidden per-user Goal rows.

**Achievements 1.0 boundary:** `achievement_definitions` + `user_achievements` with a service-owned grant path are implemented. Goals own a `completed` achievement per goal (defined on create, granted exactly once on completion, archived on delete). Sources are generic (`challenge` | `club` | `goal` | `system`) with per-source ownership and visibility guards; grants carry immutable snapshots and survive renames/deletes. Reads (recent, paginated, count, single grant) are profile-gated and source-visibility filtered; `achievement.earned` feeds activity and notifications. Achievements/Challenges are instance feature modules under Admin → Library → Modules. Deferred: points, rarity, tiers, catalog, admin creator, manual granting, leaderboards, repeatables, trading, badge cosmetics, challenge mechanics, showcase UI. Design: [ACHIEVEMENTS.md](./ACHIEVEMENTS.md); scope: V1-SCOPE §27.

**Product note:** this should be treated as a general engine capability rather than a Hardcover-style "reading goals" implementation. Feylore’s differentiator is cross-domain, rule-based tracking over the canonical library and user state.

---

---

## Pass 16 — Experience platform

**V1-SCOPE:** §17 Activity, §18 Social features, §19 Statistics

Limited social foundation — not a broad social platform. No messaging, elaborate social feeds, or recommendation network.

- [ ] Activity privacy controls and visibility settings (extends Pass 3 activity)
- [ ] Profile viewing
- [ ] Limited user ratings visibility
- [ ] Basic sharing controls where necessary
- [x] Personal statistics page (`/stats`): meaningful metrics, not decorative KPIs → implemented as Pass 16.1 (Stats 1.0, see below)
- [ ] Privacy defaults conservative; photos and personal activity treated carefully

---

## Pass 16.1 — Stats 1.0 (personal media statistics)

**Authority:** [STATS.md](./STATS.md) (supersedes V1-SCOPE §19 for Stats). Deliberate exception to the "no analytics dashboard" guidance: every number describes something real that happened.

- [x] `user_stat_facts` fact store + migration `0056_user_stat_facts.sql` (unique `(user_id, kind, source, source_key)`, visibility defaults `private`)
- [x] `StatsFactRecorder` (idempotent `record`, current-state `recordRated` preserving first-rating date, `deleteRated`) + `SnapshotResolver` (book/audiobook/album/track/movie/tv_show/tv_episode/podcast_episode) + genre vocabulary `termId` enrichment
- [x] Writer wiring: user-state ratings, reading-progress completions, reading-activity sessions, playback starts/completions
- [x] `stats.backfill` job (ratings, reading completions, activity completions/plays, reading sessions) + worker/handler registration
- [x] Stats API (`GET /api/v1/profiles/:username/stats[/:domain]`, auth required, profile gate reuses `canViewProfileAsync`, SQL visibility filter before aggregation, all-time request range)
- [x] Frontend: `/stats` redirect, `/users/:username/stats[/:domain]`, masthead heading as date picker, all 7 tabs always rendered, hand-rolled SVG charts, `stats` i18n namespace
- [x] Tests: range/label contract (incl. all STATS.md §2.2 cases), aggregation fixture, API privacy/idempotency/writer/auth coverage (DB-backed, `skipIf` without Postgres)
- [x] DESIGN-SYSTEM data-viz note (token reuse, no new color tokens)

---

## Pass 17 — PWA and offline refinement

**V1-SCOPE:** §2 Downloads / Offline, §2 PWA

Mostly refinement — basic offline boundaries already exist in Books, Audiobooks, Movies, and TV.

- [ ] Full offline/download UX polish beyond Pass 2 baseline
- [ ] Cache management, device-aware behavior, offline playback/reading refinement

---

## Pass 18 — Performance, accessibility and release hardening

**V1-SCOPE:** §29; [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md) accessibility

- [ ] Large-library performance: pagination, indexing, scan/job concurrency
- [ ] Accessibility audit and remediation across primary flows
- [ ] Mobile/PWA polish
- [ ] Translation content (`fr` / `de`; structure exists; content external)
- [ ] Error-state audit
- [ ] Empty-state audit
- [ ] Permission/error boundary audit
- [ ] Security regression suite
- [ ] Production configuration review

---

## Deferred from V1

Moved to V2 or tracked separately. See [V1-SCOPE.md §28](./V1-SCOPE.md#28-v2-candidates) and [deffered_scopes.md](./deffered_scopes.md).

- **Photos** (was §13) — V2
- **Books: Magazines** (was §5) — V2
- **Books: News / RSS** (was §6) — V2
- Advanced shelves / rules-based shelf evaluation — **implemented** (scope-aware membership expressions)
- Rich social interaction beyond Clubs foundation — V2
- Messaging — V2
- Recommendation AI — V2
- More sophisticated sharing — V2
- Full offline sophistication beyond existing download/read/play boundaries — V2
- KOReader / external client sync APIs — V2+
- PDF/CBZ in-reader rendering (non-EPUB formats) — V2+
- Feature parity with Plex, Jellyfin, or Calibre — out of scope
