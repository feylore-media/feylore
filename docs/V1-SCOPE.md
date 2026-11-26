# Feylore V1 Scope

## Purpose

This document defines the intended V1 product.

It is deliberately broader than any single implementation pass. V1 is implemented incrementally through foundation and module passes.

This document should be updated when a product decision changes, but implementation should not silently expand the scope.

**Implementation tracking:** [todo.md](./todo.md)

**Deferred implementation notes:** [deffered_scopes.md](./deffered_scopes.md)

---

# 1. V1 Product Goal

Feylore V1 should provide a coherent self-hosted personal library for:

- books
- audiobooks
- podcasts
- music
- movies
- television
- live TV
- TTRPG material

The application should provide a unified experience for:

- library management
- metadata
- discovery
- search
- reading
- listening
- watching
- playback
- progress
- ratings
- favorites
- collections
- clubs and limited social organization
- activity
- downloads/offline use
- users
- permissions
- administration
- PWA/mobile use

V1 should be useful as a real personal library and as a multi-user application, not merely a technical proof of concept.

The platform layer — users, identity, security, privacy, administration, and operational controls — is as important as the media catalog.

---

# 2. Foundation

## V1

### Application foundation

- Web application
- Server/API
- Database
- ORM/data access layer
- Configuration
- Environment management
- Logging
- Error handling
- Health checks
- Migration system
- Seed/development data

### Authentication

- User accounts
- Login/logout
- Password management
- Session/token management
- Secure authentication flow
- Account recovery strategy
- OIDC authentication
- OIDC provider configuration
- Account linking/unlinking for OIDC identities

### Authorization

- Roles
- Permissions
- Resource-level authorization where necessary
- Object-level authorization where necessary
- Server-side authorization
- User-specific data isolation

### Security

- Secure session lifecycle
- CSRF protection
- Cookie and security headers
- Rate limiting and abuse protection for authentication and sensitive endpoints
- SSRF protection for remote metadata/feed/import URLs
- Path traversal and filesystem boundary validation
- Secure upload and file-type validation
- Audit/event foundation for security-sensitive administrative actions
- Security audit of authorization boundaries

### Storage

- Configurable storage locations
- Storage abstraction
- **Libraries** as persistent destinations (managed or in-place organization policies)
- **Ingest roots** as watched incoming filesystem trees
- **Browser upload** as an alternate ingest transport into the same pipeline
- File discovery via library scan (in-place indexing) — distinct from ingestion
- File association
- Managed storage with copy → verify → commit → retire source lifecycle
- Read-only/external storage support
- Safe filesystem access

### Ingestion (Books V1)

- Durable `ingest_items` state as source of truth for Activity UI
- Filesystem watcher and browser upload discovery
- `ingest.process` job execution via pg-boss
- Books domain processor (identify, metadata, optional EPUB normalization, organize)
- Failure, retry (same row), duplicate, unsupported, and needs-attention terminal states
- Library scan must not create ingest items

Movies, TV, and Music ingest: architectural extension points only in V1.

### Background jobs

- Job queue
- Job status
- Retry handling
- Failure handling
- Progress reporting where useful
- Job logging

### Metadata

- Metadata ingestion architecture
- Provider abstraction
- Embedded metadata extraction
- Filename/path-derived metadata where useful
- User overrides
- Provenance
- Metadata refresh
- Artwork acquisition

### Search

- Global search
- Domain-aware search
- Search indexing
- Filtering
- Sorting
- Pagination
- Search result types

### Downloads / Offline

- Download abstraction
- Download state
- Local availability
- Removal of downloaded copies
- Device-aware behavior where necessary
- Offline architecture

### PWA

- Installable application
- Responsive interface
- Service worker/cache architecture where appropriate
- Mobile navigation
- Offline foundation

### Internationalization

- Translation infrastructure
- English source strings
- English fallback
- `en-GB`
- French
- German
- Domain-based translation organization
- Crowdin-compatible structure

Actual translations may remain incomplete and should not be AI-generated as part of implementation.

---

# 3. Home

## V1

The home screen should be personalized to the current user.

Potential V1 content includes:

- continue reading
- continue listening
- continue watching
- recently added
- recently finished
- favorites
- recent activity
- useful library shortcuts

Home should not become a dashboard of meaningless statistics.

The exact layout should be determined during UI implementation.

---

# 4. Books

## V1

Books are a first-class library domain.

Support:

- books
- authors
- series
- editions/representations where useful
- editions map to Manifestation/Representation (not a flat file list)
- genres/categories
- covers
- metadata
- external identifiers
- collections
- user ratings
- favorites
- reading progress
- reading history
- downloads
- offline reading
- search
- filtering
- sorting
- shelves (basic membership)

Books may have multiple associated representations/files.

### Adding books (V1)

- **Upload** — browser multipart upload to staging, then the ingest pipeline
- **Filesystem ingest** — files dropped into configured ingest roots (nested directories supported)
- **Library scan** — indexes existing library files in place; does not ingest or move files

Ingest creates durable `ingest_items` records processed by the Books domain processor. Activity → Ingest projects this state (not pg-boss job rows).

Examples include:

- EPUB
- PDF
- CBZ
- other supported ebook/comic formats

Deleting one file must not implicitly delete unrelated representations.

---

# 5. Books: Magazines

## V2

Magazines belong under the Books domain but are deferred from V1.

Support the relevant book/document behaviors without creating a separate top-level navigation module when implemented.

---

# 6. Books: News / RSS

## V2

News/RSS belongs under Books initially but is deferred from V1.

News should not become a separate top-level application module.

---

# 7. Audiobooks

## V1

Audiobooks are a first-class audio/library domain.

Support:

- audiobooks
- authors
- narrators
- series
- metadata
- artwork
- playback
- playback progress
- listening history
- favorites
- ratings
- search
- downloads
- offline playback

Audiobooks may be related to books.

They should not simply be treated as an audio file attached to a Book entity.

A user may have both a book and an audiobook representing related content.

Deleting either representation must not destroy the other.

---

# 8. Podcasts

## V1

Podcasts are part of the audiobook/audio experience rather than a separate primary sidebar domain.

Support where practical:

- podcast feeds
- shows
- episodes
- episode metadata
- artwork
- playback
- progress
- listening history
- subscriptions/follows
- downloads
- offline playback

The podcast model should not force podcast episodes into the audiobook book model.

They share audio infrastructure but have different domain semantics.

---

# 9. Music

## V1

Music is a first-class media domain.

Support:

- artists
- albums
- tracks
- genres
- artwork
- metadata
- external identifiers
- playlists
- favorites
- playback
- queue
- playback history
- progress where meaningful
- downloads
- offline playback
- search
- filtering
- sorting

Music should have its own domain model.

Do not represent albums and tracks as books or generic media items.

---

# 10. Movies

## V1

Support:

- movies
- people/cast/crew where metadata supports it
- genres
- collections
- artwork
- metadata
- external identifiers
- playback
- watch progress
- watch history
- favorites
- ratings
- downloads
- offline playback
- search

---

# 11. Television

## V1

Support:

```text
Show
└── Season
    └── Episode
```

Support:

- shows
- seasons
- episodes
- people/cast/crew where useful
- metadata
- artwork
- playback
- episode progress
- watch history
- favorites
- ratings
- downloads
- offline playback
- search

---

# 12. Live TV

## V1

Live TV belongs under TV.

The exact integration mechanism may depend on the selected backend and architecture.

V1 should establish the appropriate abstractions for:

- channels
- channel metadata
- live playback
- schedules/EPG where supported
- channel discovery

Do not make Live TV a separate top-level library domain.

---

# 13. Photos

## V2

Photos are a first-class domain but deferred from V1.

When implemented, support photo ingestion, albums, timeline browsing, thumbnails, metadata, favorites, privacy controls, and sharing appropriate to personal media.

---

# 14. TTRPG

## V1

TTRPG is a specialized library domain/sidebar collection.

V1 scope is deliberately small: classification, metadata, resource types, browse/filtering, and campaign organization.

Before TTRPG, consolidate existing relationship machinery into a shared typed service and bounded Related read projection. Reuse the existing People credits, ordered Series membership, and Book ↔ Audiobook `related_edition` link. The read projection must support one-hop, group-selective queries with library visibility filtering, pagination, and counts that do not load targets. TTRPG adds only the predicates needed for its resources and campaign context. This is shared infrastructure, not a new cross-media browsing module. See [Relationships and People implementation](./RELATIONSHIPS-PEOPLE-IMPLEMENTATION.md).

Use cross-domain Shelves for curated groupings and landing pages. Series remains the canonical structure for ordered membership. Factual Work-to-Work relationships are independent of Shelf membership.

Placeholder identity/promotion and a minimal Related presentation are V1 only where an existing V1 feature requires them. An external reference is separate from a Feylore Work. Full placeholder UX is not a prerequisite for TTRPG.

Support appropriate organization of:

- rulebooks
- adventures
- supplements
- campaign material
- other tabletop resources

Support:

- TTRPG classification/context for existing library items
- TTRPG metadata: system, series, publisher, edition, tags
- TTRPG-specific browse/filtering
- Resource types/sections: adventures, rules, supplements, maps, handouts, bestiaries, setting/reference, etc.
- Campaign view for organizing library items into campaigns
- Assign existing library items to one or more campaigns
- Campaign-specific ordering/sections

Campaign view establishes architecture that Clubs can build upon. TTRPG campaigns use Clubs as their persistent asynchronous campaign space.

PDF is a file format, not a TTRPG domain.

A PDF may be associated with Books, TTRPG, or another domain.

Do not create a generic PDF library.

---

# 15. Clubs

## V1

Clubs are a first-class social container — a user-created group of people around a shared interest, collection, or activity.

A club is fundamentally **asynchronous**: membership, discussion, topics, announcements, shared media, schedules, and organization happen there. Real-time experiences such as watch parties and listen-together sessions are **sessions** launched from a club, not what a club is.

### Architectural model

```text
Club → persistent asynchronous group
Topic → asynchronous conversation (optionally tied to a work/media item)
Schedule → shared consumption target; recurring schedules generate discussion topics
Session → temporary synchronous activity launched from a club
Media/work → what the group is organizing around
```

### Core club

- Create a club
- Name, description, cover
- Owner and members
- Public/joinable or private/invite-only
- Join, leave, invite
- Member roles/permissions (owner, moderator, member)
- Persistent asynchronous club feed
- Basic club settings
- Club can be associated with one or more media domains where appropriate

### Club contexts

Club types are **contexts/templates**, not fundamentally different entities:

- General club
- Book club
- Video/watch club
- TTRPG campaign

Domain-specific affordances (book-oriented schedules, video-oriented schedules, campaign organization) sit inside the club context.

### Discussion

- Owner/moderators can create discussion topics
- Members can post and reply
- Topics can be pinned/closed
- Basic announcements
- Basic moderation
- Basic reactions and @mentions
- Topics can optionally be associated with a work/media item
- A discussion topic is not necessarily tied to a particular media type
- Spoiler-aware discussion: explicit spoiler segments in posts; automatic hiding when the viewer’s progress is reliably behind an anchor (no hide when progress is unknown)
- Schedule occurrences act as **discussion anchors** (distinct from topics); anchors exist before conversation; topics are created lazily on first message

### Club detail overview

The accepted Club navigation is Overview, Current Read, Discussions, Nominations, Library, Members, and Stats. Settings is a separate permission-gated action. `/clubs/:id/activity` remains a compatibility route.

Overview surfaces:

- Current club work and member check-in status for the active schedule occurrence
- Prioritized discussion anchors (current check-in, last check-in, recent activity)
- Active “What’s Next?” poll when one is published
- Shared quotes (book clubs only)

`GET /clubs/:id/overview` aggregates these sections for the overview tab.

### Work selection and check-in

- Owner/moderator can set the club’s current work directly
- “What’s Next?” polls: draft → candidate discovery → owner review → publish → member voting → close → apply result as current work
- Poll discovery uses member TBR shelf items (not inferred unread status), club queued works, and library availability; excludes current/completed club works
- Members can check in (“caught up”) against the current open schedule occurrence

### Quotes (book clubs)

- Members can share quotes on the club overview (book context only)
- Sharing from private reading annotations requires an explicit share action; other members’ annotations are never exposed
- Optional link back to `sourceAnnotationId` when shared from the reader journal

### Schedules

Schedules are a first-class Club primitive — the mechanism that creates recurring club structure.

For clubs centered around books or video, owner/moderators can establish consumption schedules. Schedules generate discussion topics rather than requiring manual topic creation for each occurrence.

Support:

- One-time and recurring schedules (daily, weekly, monthly, custom)
- Consumption targets (chapters, episodes, pages, etc.)
- Automatic discussion topic generation from schedule items
- Topic timing (open immediately, open on scheduled date, etc.)
- Members can see current/upcoming club schedule

Schedules are organizational features, not complicated synchronization systems.

### Sessions

- Club owner/moderator can initiate a watch party from the club
- Club owner/moderator can initiate a listen-together session from the club
- Sessions belong to or originate from the club but do not redefine the club

### Clubs revision decision - September 15, 2026

The Clubs Revision is V1. This decision supersedes earlier V1/V2 boundaries where they conflict with the revision.

V1 includes first-class Club Read occurrences and rereads; Current Read; read-specific schedules/check-ins; progress-safe location discussions; explicit Club Journal sharing; Selection Rounds with separate nomination/voting periods; member and external nominations; immutable candidate metadata snapshots; simple poll, deterministic ranked choice, and persisted auditable random draw; Shelf/rule-driven pools; Club Library/history and completed-read wrap-ups; member reading presence; derived club reading/rating statistics; permission-gated Settings and defaults; recoverable automatic selection transitions; and Club events in both Club Overview and global Upcoming.

Personal progress, ratings, and private Journal content remain user-owned. Check-ins do not change personal progress. General topics and club-wide schedules remain valid without a Club Read. External nominations and selected reads require neither canonical Work creation nor a Representation/file. Club Reads may resolve to a canonical Work or an external candidate snapshot through the normal Work/metadata boundary.

Read start/end, check-in, nomination opening/closing, voting opening/closing, final discussion, and upcoming-read events use a reusable derived event abstraction suitable for global Upcoming. No second calendar architecture is authorized. An iCal/export integration point may be prepared.

Stats derive useful reading questions from authoritative user-scoped data, including genres, completed reads, pages, duration, participation, aggregate ratings, recommendations, dimensions, trajectories, highest-rated/divisive reads, and activity over time. Arbitrary reports, general analytics infrastructure, and external analytics dashboards remain outside this pass.

### Explicitly not V1 for Clubs

- Real-time club chat
- Synchronous session infrastructure beyond launching/connecting to existing experiences
- Advanced social graphs
- Sophisticated recommendation systems
- Advanced synchronization
- Expanded media integrations
- Advanced sharing
- Sophisticated external calendar functionality (bidirectional Google Calendar, CalDAV, provider reconciliation/recurrence synchronization, external attendee management)
- Specialized music clubs
- Specialized photo clubs

---

# 16. User State

## V1

User state is distinct from metadata.

Support as appropriate by domain:

- favorites
- ratings
- progress
- history
- completion state
- bookmarks where applicable
- downloads
- playback position
- reading position

External metadata ratings must not overwrite user ratings.

Metadata refreshes must not destroy user progress.

User state must be isolated per user.

---

# 17. Activity

## V1

The application should record useful user activity.

Examples:

- started reading
- finished reading
- started listening
- finished listening
- watched
- rated
- favorited
- added to collection

Activity must have privacy controls.

Activity should be designed so that it can support Clubs and limited social features without requiring a full social network.

---

# 18. Social Features

## V1

Social foundation is provided primarily through **Clubs** (§15).

Additional limited social support:

- profiles
- privacy settings
- activity visibility
- sharing controls where necessary
- user ratings visibility (limited)
- personal statistics (§19)

Full social networking is not required for V1.

Do not build messaging, elaborate social feeds, follows, or recommendation networks in V1.

---

# 19. Statistics

## V1

Useful personal statistics are in scope.

Examples:

- reading time
- listening time
- watching time
- items completed
- favorite genres
- favorite creators
- activity over time

Statistics should be meaningful rather than decorative.

Do not build a large analytics dashboard simply to fill space.

---

# 20. Goals and rule-driven tracking

## V1

Goals should be a shared cross-domain rules engine rather than separate media-specific implementations for books, audiobooks, movies, challenges, and other tracking features.

The canonical model is:

```text
Goal
├─ Identity (title, description, icon, visibility)
├─ Target (value + metric)
├─ Activity (finish | consume | progress)
├─ Period (startsAt / endsAt)
└─ Rules (eligibility expression)
```

A goal therefore models: "Reach [target] [metric] during [period], counting items where [rules]."

Examples:

- Finish 30 books in 2027.
- Watch 50 movies in 2027.
- Listen to 10,000 minutes of audiobooks this year.
- Finish 12 works from my Classics shelf.
- Read or listen to 20 fantasy works.
- Watch 10 movies directed by women.
- Finish 20 things already in my library before January 1.
- Spend 500 hours with media this year.

Metrics should be domain-aware rather than a single giant enum. Books may expose `works` / `pages`; audiobooks may expose `works` / `minutes` / `hours`; movies may expose `movies` / `hours`; podcasts may expose `episodes` / `hours`; music may expose `albums` / `tracks` / `hours`; and cross-domain goals can use shared metrics such as `works`, `items`, `minutes`, and `hours` when the underlying activity supports them.

The same expression model should power goal rules and dynamic Shelf predicates. A practical representation is:

```ts
type RuleExpression =
  | { type: "group"; operator: "and" | "or"; children: RuleExpression[] }
  | { type: "predicate"; field: string; operator: string; value: unknown };
```

Rule legality should be determined by a shared registry that is aware of the selected domain(s). That makes goals, smart collections, challenge conditions, and dynamic shelves use the same platform rather than parallel ad hoc implementations.

Goal creation should stay simple by default. The default yearly goal should be a 15-second operation, with progressive UI for rule groups, metric choice, distinct counting, and more advanced filters.

Distinct-count goals are in scope and should be supported early, for example:

- Read works from 12 different creator nationalities
- Read 10 different authors
- Watch movies from 15 different release years
- Listen to albums by 20 different artists

Unknown metadata must remain unknown. Sensitive creator attributes such as gender, ethnicity, nationality, sexual orientation, and similar dimensions should only count when explicit metadata is present and user-authorized. Feylore should never infer those values silently.

Challenges should be built as structured collections or curated bundles of goals/rules rather than a second parallel tracking system. Goals are the measurable primitive; Challenges are the organized presentation around them.

Goals are also the first owning feature for Achievements: each goal defines a `completed` achievement on creation and grants it exactly once on completion. See §27 Achievements.

---

# 20. Search

## V1

Global search should be capable of finding relevant entities across domains.

Examples:

- books
- authors
- series
- audiobooks
- narrators
- podcasts
- artists
- albums
- tracks
- movies
- shows
- episodes
- collections
- clubs (where appropriate)

Search should support appropriate filtering and ranking.

---

# 21. Playback

## V1

A shared playback architecture should support the media types that require playback.

It should support:

- play/pause
- seek
- queue
- current item
- progress persistence
- resume
- playback history
- appropriate background/mobile behavior

Audio and video should not be forced into identical UI where their interaction models differ.

Watch parties and listen-together sessions launched from Clubs connect to this playback architecture.

---

# 22. Reading

## V1

Reading should support appropriate ebook/document formats.

Support:

- opening supported files
- reading position
- resume
- progress
- bookmarks where feasible
- offline reading
- basic reader preferences

The exact format support is determined by the selected reader technology.

Reading Position

Reading progress must use a representation-independent Feylore locator abstraction. EPUB implementations should preserve EPUB CFI when available and should integrate with Readium's locator model. The system should additionally retain progression and contextual location information sufficient to recover from locator changes where possible.

Cross-Client Progress Synchronization

Reading and listening progress should synchronize across Feylore clients and supported external reading clients where an integration exists.

Synchronization is enabled by default and may be disabled by the user.

EPUB positions should use a standards-compatible locator model and preserve EPUB CFI where available.

The synchronization system must not depend on a particular reader implementation.

Audiobook playback positions should synchronize independently using temporal positions.

EPUB ↔ audiobook progress synchronization may occur when Feylore has a sufficiently reliable relationship and mapping between the representations. It must not assume that equal percentage progress represents equal content.

EPUB Media Overlays should provide an especially strong synchronization mechanism because the publication itself defines text/audio relationships.
---

# 23. External Integrations

## V1

The architecture should support integrations without allowing external systems to dictate the internal domain model.

Potential integrations may include:

- metadata providers
- download managers
- ebook/audiobook tooling
- media automation systems
- external storage

Examples may include tools such as Chapterarr or Shelfmark where appropriate.

Integration work should occur through adapters/services.

Do not hard-code a third-party API throughout the application.

---

# 24. Privacy and Security

## V1

Support:

- authenticated users
- roles
- permissions
- private user activity
- controlled sharing
- protected files
- secure download authorization
- safe filesystem access
- secure external integration boundaries
- OIDC authentication and account linking
- CSRF protection and secure session lifecycle
- rate limiting for authentication and sensitive endpoints
- SSRF protection for remote URLs
- filesystem/path boundary validation
- secure upload validation
- audit logging for security-sensitive actions
- conservative privacy defaults

Photos and personal activity should receive particularly careful treatment.

Security and identity hardening is a release gate, not optional polish.

---

# 25. Administration

## V1

Provide administrative functionality as an operational control plane at `/admin`.

`/admin` = the installation. `/settings` = the current user.

Any administrative permission grants access to `/admin`. Individual sections are independently permission-gated.

Support:

- users (creation, editing, disabling, deletion)
- roles
- permissions
- user-role assignment
- libraries
- storage locations
- ingest roots
- ingest activity / processing queue
- scans (library index; not ingestion)
- jobs (including failed/retryable)
- metadata provider configuration
- integrations
- global application configuration
- system status/health
- administrative audit log
- dangerous-action confirmations
- appropriate bulk operations

Administration should not require direct database editing.

Global settings belong in administration, not in personal settings.

---

# 26. Settings

## V1

User settings at `/settings` are **personal-only**.

Support appropriate controls for:

- account
- appearance
- playback
- reading
- downloads
- privacy
- language
- notifications (where V1 requires them)
- session/device management
- password change
- account linking/unlinking (OIDC)
- account recovery

Administrative and global settings must remain distinct from personal settings.

---

# 27. Achievements

## V1

Achievements are earned accomplishments owned by Feylore features. A definition describes what can be earned; a grant records that a user earned it. Full design: [ACHIEVEMENTS.md](ACHIEVEMENTS.md).

Achievements 1.0 is complete when Feylore can programmatically define an achievement, safely grant it exactly once, retain its provenance, retrieve it for a user's profile, respect source visibility, and emit `achievement.earned`.

V1 includes:

- `achievement_definitions` (stable key, name, description, optional Solar icon, optional presentation metadata, generic `sourceType`/`sourceId`, creator, timestamps, `active`/`archived` lifecycle)
- `user_achievements` grants (recipient, definition, `earnedAt`, provenance/source context, compact immutable snapshot, optional metadata) with one grant per user per definition and idempotent granting
- an Achievement service boundary (`defineAchievement`, `updateAchievementDefinition`, `archiveAchievement`, `grantAchievement`, `hasAchievement`, `getUserAchievements`, `getAchievement`, `getSourceAchievements`) with feature ownership enforced per source
- first-class provenance: a grant stays understandable after the source is renamed or deleted; archived definitions/sources are retained over destructive deletion
- privacy: define/grant authority from the source feature, view authority from profile/privacy rules with source-visibility filtering (a private source's achievements never leak to viewers who cannot see that source)
- profile/API read foundation: recent achievements, paginated all earned, count, and a user's grant of a definition; profiles show a simple Recent Achievements section
- canonical `achievement.earned` activity/domain event carrying IDs and structured context as the integration point for activity and notifications
- Achievements and Challenges registered as instance feature modules under Admin → Library → Modules with enable/disable; disabling stops processing and hides surfaces while retaining stored data
- Goals as the first owning feature: each goal defines a `completed` achievement on creation and grants it exactly once on completion

V1 explicitly excludes: achievement points/gamerscore, rarity, tiers, a global achievement catalog, an admin achievement creator, manual granting UI, leaderboards, repeatable achievements, trading, badge cosmetics, and challenge-specific mechanics (bingo, blackout, deadlines, objectives, participation). Dedicated achievement history/showcase UI comes later.

---

## 28. V2 Candidates

V2 primarily expands the social, personalization, integration, and library-management systems established in V1. These are extensions of existing foundations rather than requirements for the initial release.

### Social, profiles, and community

- **Challenges** — shared or curated challenges built on the Goals/rules engine, including Bingo-style challenge boards, completion history, and profile display.
- **Buddy Reads / Watches / Listens** — lightweight temporary shared-consumption spaces for small groups that do not require creating a permanent Club. Shared progress, spoiler-safe discussion, and a completed-history artifact.
- **Advanced Clubs**

  - More sophisticated reading schedules: dependencies, multiple tracks, automatic catch-up and rescheduling.
  - Reading-specific discussion enhancements.
  - Scheduled watch parties with RSVP, notifications, host controls, rejoin, synchronization, and post-party discussion.
  - Listen-together enhancements.
  - Read/watch/listen party history.
  - Custom Club artwork/logo management.
  - Richer current/next-work presentation.

- **Following and friend relationships.**
- **Direct member-to-member recommendations** presented as media postcards rather than generic messages or gifts.
- **Shared history and taste overlap** between users.
- **Profile enhancements**

  - Richer personal statistics.
  - Goals and Challenges presentation.
  - Shared-history and taste-overlap views.
  - Additional profile customization and scrapbook-style presentation.

- **Presence / activity status** — Now Reading, Listening to, Watching, etc., including domain-appropriate heartbeat and fallback behavior.
- **Channels** — user-created, followable, always-on media programming built from the library, with installation-level control over whether channels may be viewed beyond the login gate.
- **Advanced reactions, mentions, notifications, sharing, and invitations.**

### Personal library and organization

- **Mark media as owned**, including future physical-edition/copy management.
- **Wishlist** and acquisition-oriented workflows.
- **Shelf mirroring / polyhierarchy** — allow one shelf to appear beneath multiple parent shelves while remaining one canonical shelf.
- **Shelf cloning.**
- **Re-order shelves.**
- **Re-order sidebar modules.**
- **Series-focused views.**
- **Advanced shelf capabilities** beyond the V1 rules engine and scope-aware membership system.
- **Limit or curate incoming genres and tags.**
- **Import media lists** from Goodreads CSV and similar formats.
- **Export media lists and metadata per module.**
- **Export shelves, user settings, and other portable personal configuration.**

### Integrations and connected accounts

User-facing integrations should live as connected services rather than being treated purely as metadata providers where appropriate.

Potential integrations include:

- StoryGraph
- Letterboxd
- Hardcover
- Bluesky
- Libby
- KOReader and other external reading clients
- Upcoming/calendar integrations
- Additional media services as useful APIs become available

Integration capabilities may include importing history, synchronizing status/progress where technically appropriate, exposing external profile links, and enriching Feylore social/profile surfaces.

### Metadata and discovery

- **Richer recommendation systems**, including rule-, taste-, relationship-, and metadata-driven recommendations.
- **Romance.io** metadata/discovery support.
- **Moly.hu** Hungarian metadata parser.
- **Lesbian Romance Reads** trope-oriented discovery/recommendation integration where technically and legally practical.
- **Enhanced People pages**

  - Social and external links.
  - Series presentation.
  - Upcoming works.
  - Richer creator discovery.

- Additional metadata providers and domain-specific parsers.
- Improved metadata-driven Calendar/Upcoming support.

### Media and reading

- **Photos domain.**
- **Books: Magazines.**
- **Books: News / RSS.**
- **Expanded podcast features.**
- **CBX conversion.**
- **Non-EPUB in-reader formats**, including PDF and CBZ rendering.
- **Advanced synchronization** across devices and clients.
- **Full offline sophistication** beyond the V1 download/read/play boundaries.
- Additional media integrations and formats as the shared media model matures.

### Calendar and notifications

- Calendar subscriptions and external calendar integration.
- Followed-media and followed-person release notifications.
- Saved searches and subscriptions.
- iCal/RSS interoperability.
- Wishlist-related upcoming/release notifications.
- Rich notification preferences and delivery controls beyond the V1 notification foundation.

### Platform and deployment

- **Docs / Docker Compose generator** for installation and deployment configuration.
- More sophisticated import/export and migration tooling.
- Advanced synchronization infrastructure.
- Additional administrative controls needed by V2 integrations and public-facing social features.

### Explicit V1 foundations

The following are **not V2 features themselves** and should not be deferred when implementing V1:

- Basic book, watch/video, and TTRPG Clubs.
- Club discussions, schedules, work selection, check-ins, and basic social interaction.
- The shared Goals/rules engine.
- Rule-based shelf membership.
- The canonical Calendar/Upcoming system.
- Public/private user profiles and their basic social foundation.
- Basic notification infrastructure required by V1 features.

V2 builds richer experiences on top of these foundations rather than replacing them.

---

# 29. Implementation Order

V1 should be implemented approximately in this order:

1. Foundation (including security/identity groundwork)
2. Books
3. Core UX (activity, search UI, account settings, job handlers)
4. Playback foundation
5. Home
6. Audiobooks and podcasts
7. Music
8. Movies
9. TV and Live TV
10. TTRPG
11. Clubs
12. Users
13. Administration
14. Security, privacy, and identity hardening
15. Limited experience platform (activity privacy, profiles, personal statistics)
16. PWA/offline refinement
17. Performance, accessibility, and release hardening

The order may change when dependencies make another sequence more appropriate.

Detailed pass status, acceptance criteria, and corrections to this order (for example, **Playback** before **Audiobooks**, and **Home** before audio domains) are tracked in [`todo.md`](./todo.md).

---

# 30. V1 Boundary Rule

If a proposed feature does not clearly support the V1 product goal, it should not be added to V1 simply because another media application has it.

The goal is a coherent, useful library with a solid multi-user platform.

Not maximum feature count.
