# Feylore API Conventions

Base path: `/api/v1`

## Request / response

### Success

```json
{ "data": { ... } }
```

### Paginated

```json
{
  "data": [ ... ],
  "page": { "nextCursor": "...", "prevCursor": null }
}
```

### Error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": {}
  }
}
```

## HTTP status codes

| Code | Use               |
| ---- | ----------------- |
| 200  | Success           |
| 201  | Created           |
| 202  | Job enqueued      |
| 204  | No content        |
| 400  | Bad request       |
| 401  | Unauthenticated   |
| 403  | Forbidden         |
| 404  | Not found         |
| 409  | Conflict          |
| 422  | Validation failed |
| 429  | Rate limited      |

## Authentication

Session cookie (`feylore_session`): httpOnly, SameSite=Lax, Secure in production.

State-changing requests require valid Origin/Referer (CSRF protection).

See [AUTHENTICATION.md](./AUTHENTICATION.md) for OIDC configuration, recovery policy, and account linking.

## Pagination

Cursor-based. Query: `?cursor=...&limit=50` (default limit 50, max 100).

## Filtering and sorting

Per-endpoint allowlists only. Unknown filters rejected.

## Versioning

URL prefix `/api/v1`. Breaking changes require new major version.

## Foundation endpoints

| Method                | Path                                                                                        | Description                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET                   | `/health`                                                                                   | Health check                                                                                                                                                                                                    |
| GET                   | `/auth/setup-required`                                                                      | Whether first-run setup is required                                                                                                                                                                             |
| GET                   | `/auth/methods`                                                                             | Enabled auth methods (`internal`, `oidc`, `recovery`, `passwordReset`)                                                                                                                                          |
| POST                  | `/auth/setup`                                                                               | First-run admin creation                                                                                                                                                                                        |
| POST                  | `/auth/login`                                                                               | Login (optional `deviceId`; server verifies ownership)                                                                                                                                                          |
| POST                  | `/auth/logout`                                                                              | Logout                                                                                                                                                                                                          |
| GET                   | `/auth/me`                                                                                  | Current user + permissions + `hasPassword` + `theme` + self profile                                                                                                                                             |
| PATCH                 | `/auth/me`                                                                                  | Update display name, locale, bio, avatar, visibility, `profileJson` (self)                                                                                                                                      |
| GET                   | `/auth/me/profile`                                                                          | Self profile detail (self)                                                                                                                                                                                      |
| PATCH                 | `/auth/me/username`                                                                         | Change username (self; rate-limited)                                                                                                                                                                            |
| POST                  | `/auth/me/avatar`                                                                           | Upload avatar image (multipart; self)                                                                                                                                                                           |
| GET                   | `/profiles/:username`                                                                       | Public profile by username (authenticated; visibility-filtered)                                                                                                                                                 |
| GET                   | `/profiles/:username/full`                                                                  | Viewer-aware profile (links, follows, obsessions, artifacts, appearance; authenticated; `/settings/privacy` authoritative)                                                                                      |
| GET                   | `/profiles/:username/card`                                                                  | Lightweight identity card for hover/focus previews (userId, username, displayName, avatar, pronouns, truncated bio, followerCount, viewerIsFollowing; same visibility gate as `/full`; no activity data)        |
| GET/PATCH             | `/profiles/me` + `/profiles/me/extended`                                                    | Extended self profile (pronouns, banner, appearance, guestbook pref)                                                                                                                                            |
| POST                  | `/profiles/me/banner`                                                                       | Upload banner image (multipart; self)                                                                                                                                                                           |
| GET/POST/PUT          | `/profiles/me/links`, `/profiles/me/links/:linkId`, `/profiles/me/links/reorder`            | Extensible profile links (presentation-time provider icons)                                                                                                                                                     |
| POST/DELETE           | `/profiles/:username/follow`                                                                | Idempotent follow/unfollow (no self-follow)                                                                                                                                                                     |
| GET                   | `/profiles/:username/followers`, `/profiles/:username/following`                            | Follow lists (visibility-filtered)                                                                                                                                                                              |
| GET/POST/PATCH/DELETE | `/profiles/me/obsessions`, `/profiles/me/obsessions/:id`, `/profiles/me/obsessions/reorder` | Up to 3 ordered obsessions (Work/Person/Series/Shelf/Club; no user-state side effects)                                                                                                                          |
| GET/POST/PATCH/DELETE | `/profiles/me/artifacts`, `/profiles/me/artifacts/:id`, `/profiles/me/artifacts/reorder`    | Composable artifacts (`obsessions`, `favorites`, `favorite-quote`, `currently-reading`, `recent-five-star`, `favorite-person`, `shelf-preview`, `club`, `recent-activity`, `stats`); visibility is shown/hidden |
| GET/POST              | `/profiles/:username/guestbook`                                                             | Guestbook list/post (enable/disable pref; no threads)                                                                                                                                                           |
| PATCH/DELETE          | `/profiles/guestbook/:entryId`                                                              | Edit own entry; delete own or own-guestbook entry                                                                                                                                                               |

Identity shown in lists and social surfaces is conveyed as user summary objects (`userId`, `username`, `displayName`, `avatar`, optionally `pronouns` and `cosmetics`) so clients can render styled display names (`ProfileName`) without extra lookups. `cosmetics` carries the persisted name-style draft (e.g. `usernameColor`/`usernameStyle`; see `@shared/profile-cosmetics`), is omitted when `null`, and is normalized server-side via `normalizeProfileCosmetics`. It appears on user-summary DTOs across profiles (`/auth/me` self profile, followers/following/card/guestbook entries), clubs (members, invites, mentions, topics, posts, quotes, feed actors, presence, experience participants, selection nominators), and shelves (editors, editor search).
| POST | `/auth/password` | Change or set password (self) |
| GET | `/auth/sessions` | List active sessions (self) |
| DELETE | `/auth/sessions/:id` | Revoke a session (self) |
| DELETE | `/auth/sessions?others=true` | Revoke all sessions except current |
| POST | `/auth/password-reset/request` | Request password reset email (always 200) |
| POST | `/auth/password-reset/confirm` | Complete password reset with token |
| GET | `/auth/oidc/login` | Start OIDC login (redirect) |
| GET | `/auth/oidc/callback` | OIDC callback (redirect) |
| POST | `/auth/oidc/link` | Start OIDC account linking |
| DELETE | `/auth/oidc/link` | Unlink OIDC identity |
| GET | `/auth/identities` | List linked OIDC identities (self) |
| GET/POST | `/users` | User management (admin) |
| GET | `/users/:id` | User detail (admin) |
| PATCH | `/users/:id` | Update user (admin) |
| POST | `/users/:id/disable` | Disable or enable user (admin) |
| DELETE | `/users/:id` | Delete user (`confirm: true` in body) |
| PUT | `/users/:id/roles` | Replace user roles (`users.roles.assign`) |
| GET | `/roles` | List roles with permissions |
| GET | `/roles/:name` | Role detail with permissions |
| PUT | `/roles/:name/permissions` | Update role permissions (`roles.write`) |
| GET | `/permissions` | List permissions |
| GET/POST/PATCH/DELETE | `/libraries` | Library destinations (content type, policies, storage) |
| POST | `/libraries/:id/scan` | Library index scan (does not create ingest items) |
| POST | `/libraries/:id/validate` | Validate library storage mount |
| GET/PATCH | `/storage/locations` | Mounted storage registrations (includes `rootPath`, runtime `health`) |
| POST | `/storage/locations` | Register an already-mounted path visible inside the container |
| POST | `/storage/scans` | Enqueue storage scan (legacy; prefer library scan) |
| GET | `/ingest/items` | List ingest items (durable state) |
| GET | `/ingest/items/:id` | Ingest item detail |
| POST | `/ingest/items/:id/retry` | Retry failed/needs_attention item (same row) |
| POST | `/ingest/upload` | Multipart browser upload → ingest queue |
| GET | `/ingest/upload-limits` | Browser upload limits |
| GET/POST/PATCH/DELETE | `/ingest/roots` | Ingest source configuration (`DELETE` removes watch config, not files) |
| GET/HEAD | `/files/:id` | File metadata / stream |
| GET | `/files/:id/content` | File stream with Range support |
| GET/POST | `/jobs` | List (`?type=`, `?status=`, `?limit=`, `?cursor=`) / enqueue jobs |
| GET | `/jobs/:id` | Job status |
| POST | `/jobs/:id/cancel` | Cancel job |
| GET/POST/PATCH/DELETE | `/shelves` | Shelf CRUD (`?scope=` filter on GET) |
| GET/PUT/POST/DELETE | `/shelves/:id/grants` | Editor management (owner) |
| GET | `/shelves/:id/scope-preview` | Scope change incompatible items preview |
| GET | `/users/search?q=` | User search for shelf editors (`shelves.write`) |
| GET/POST/PATCH/DELETE | `/clubs` | Club CRUD |
| POST | `/clubs/:id/join` | Join public club (`clubs.write`) |
| POST | `/clubs/:id/leave` | Leave club (`clubs.write`) |
| GET | `/clubs/:id/members` | List club members |
| PATCH/DELETE | `/clubs/:id/members/:userId` | Update/remove member role |
| POST/GET/DELETE | `/clubs/:id/invites` | Club invite management |
| POST | `/clubs/invites/:token/accept` | Accept club invite |
| GET | `/clubs/:id/feed` | Club activity feed |
| GET/POST | `/clubs/:id/topics` | List / create club topics |
| GET/PATCH | `/clubs/:id/topics/:topicId` | Topic detail / pin / close |
| POST/DELETE | `/clubs/:id/topics/:topicId/posts` | Create post / delete post |
| POST | `/clubs/:id/topics/:topicId/posts/:postId/reactions` | Toggle reaction |
| GET | `/clubs/:id/overview` | Aggregated overview tab payload (`checkIn`, `work`, `discussionAnchors`, `activePoll`, `quotes`, `viewerProgress`) |
| GET | `/clubs/:id/check-in` | Check-in summary for current schedule occurrence |
| POST/DELETE | `/clubs/:id/schedule/occurrences/:occurrenceId/check-in` | Toggle member check-in (`clubs.write`) |
| GET | `/clubs/:id/discussion-anchors` | Default prioritized discussion anchors (`?limit=`, default 5) |
| GET | `/clubs/:id/discussion-anchors/all` | All occurrence anchors + general topics |
| POST | `/clubs/:id/schedule/occurrences/:occurrenceId/discussion` | Lazy-create topic for an occurrence (`clubs.write`) |
| GET/POST | `/clubs/:id/works` | List / associate works with club |
| GET | `/clubs/:id/works/current` | Current work detail for viewer |
| PATCH/DELETE | `/clubs/:id/works/:workId` | Update / remove club work |
| GET | `/clubs/:id/schedule` | Current, upcoming, and past schedule |
| GET/POST | `/clubs/:id/schedules`| List / create consumption schedules |
| PATCH/DELETE | `/clubs/:id/schedules/:scheduleId` | Update / delete schedule |
| GET | `/clubs/:id/polls` | List polls (moderator; draft/review workflow) |
| GET | `/clubs/:id/polls/active` | Active poll for members (or `null`) |
| GET | `/clubs/:id/polls/:pollId` | Poll detail with options and vote state |
| POST | `/clubs/:id/polls` | Create poll draft (`clubs.write`) |
| POST | `/clubs/:id/polls/:pollId/discover` | Run candidate discovery (`clubs.write`) |
| POST | `/clubs/:id/polls/:pollId/options` | Add manual poll option (`clubs.write`) |
| DELETE | `/clubs/:id/polls/:pollId/options/:optionId` | Remove poll option (`clubs.write`) |
| POST | `/clubs/:id/polls/:pollId/publish` | Publish poll (`clubs.write`) |
| POST | `/clubs/:id/polls/:pollId/votes` | Cast or change vote (`clubs.write`) |
| POST | `/clubs/:id/polls/:pollId/close` | Close poll (`clubs.write`) |
| POST | `/clubs/:id/polls/:pollId/apply-result` | Set winning option as current work (`clubs.write`) |
| GET | `/clubs/:id/quotes` | Overview quotes (`?limit=`, book clubs only) |
| GET | `/clubs/:id/quotes/all` | All club quotes (book clubs only) |
| GET | `/clubs/:id/quotes/shareable-annotations` | Viewer annotations eligible to share (book clubs only) |
| POST | `/clubs/:id/quotes` | Share quote (`clubs.write`, book clubs only) |
| DELETE | `/clubs/:id/quotes/:quoteId` | Delete own quote or moderate (`clubs.write`) |
| GET/POST/DELETE | `/downloads` | Download management |
| GET/PATCH/DELETE | `/devices` | Device list, register, revoke |
| GET/PATCH | `/devices/:id` | Device detail; rename / `settingsJson` |
| PUT | `/devices/:id/state` | Upsert device-specific `stateJson` |
| GET | `/search` | Entity search |
| GET | `/home` | Personalized home feed (aggregated) |
| GET | `/activity` | User activity (own) |
| GET | `/audit` | Audit log (admin) |
| GET/PATCH | `/metadata/providers` | Provider registry with descriptors (no secrets on GET) |
| POST | `/metadata/providers/:key/test` | Test provider connection |
| GET | `/metadata/enabled-modules` | Enabled media modules for metadata settings |
| GET | `/metadata/settings` | Metadata settings per enabled module |
| PATCH | `/metadata/settings/:moduleId/priorities` | Update field source priorities |
| PATCH | `/metadata/settings/:moduleId/matching` | Update matching rules |
| GET/POST/PATCH/DELETE | `/metadata/formatting/custom-fields` | Custom metadata field definitions (`?mediaModule=&entityType=`) |
| PUT | `/metadata/formatting/custom-fields/reorder` | Reorder fields within scope |
| GET | `/metadata/formatting/custom-fields/modules` | Enabled media modules for custom fields |
| GET/PATCH | `/books/:slug/custom-fields` | Book custom field values |
| GET/PATCH | `/books/series/:id/custom-fields` | Book series custom field values |
| GET/PATCH | `/files/:id/custom-fields` | File custom field values |
| GET/PATCH | `/metadata/formatting/settings` | Language representation settings (`metadata.formatting.*`) |
| GET | `/metadata/formatting/terms` | Genre/tag vocabulary tree (`?kind=genre\|tag`; genres optionally filter with `&mediaType=books\|audiobooks\|movies\|tv\|music\|podcasts\|ttrpg`) |
| GET | `/metadata/formatting/terms/search` | Search terms and aliases (`?kind=&q=`) |
| POST/PATCH/DELETE | `/metadata/formatting/terms` | Vocabulary CRUD |
| PUT | `/metadata/formatting/terms/:id/aliases` | Set aliases for a term |
| GET | `/metadata/formatting/suggestions` | Open formatting suggestions |
| GET | `/metadata/formatting/suggestions/similar` | Similar canonical terms for a value |
| POST | `/metadata/formatting/suggestions/:id/resolve` | Resolve suggestion (`accept_alias`, `assign_existing_term`, `ignore`) |
| GET/PATCH | `/admin/system/modules` | Enabled media modules (`system.settings.*`) |
| GET | `/instance` | Public installation profile (display name, defaults, branding URLs) |
| GET | `/instance/logo` | Public custom logo (404 when unset) |
| GET | `/instance/favicon` | Public custom favicon (404 when unset) |
| GET/PATCH | `/admin/system/configuration` | Installation general settings (`system.settings.*`) |
| GET/PATCH | `/admin/system/appearance` | Installation branding file references (`system.settings.*`) |
| POST/DELETE | `/admin/system/appearance/logo` | Upload or reset installation logo |
| POST/DELETE | `/admin/system/appearance/favicon` | Upload or reset installation favicon |
| GET/PATCH | `/integrations` | Integration config (no secrets on GET) |
| GET/PATCH | `/settings/reader` | User reading preferences (progress sync) |
| GET/PATCH | `/settings/playback` | User playback preferences (progress sync) |
| GET/PATCH | `/settings/appearance` | User theme preference (`light`, `dark`, `system`) |
| GET/PATCH | `/settings/privacy` | User privacy preferences (activity visibility) |
| GET | `/representations/:id/playback` | Authorized playback manifest (stream URLs) |
| GET/PUT | `/playback/progress` | Listening/watching progress (temporal locator) |
| GET | `/playback/history` | Recent listening history for current user |
| POST | `/presence/start` | Start presence session (`reading` via reader `start/touch/end`; `listening`/`watching` via player `start/heartbeat/end`) |
| POST | `/presence/touch` | Reader engagement touch (`sessionId`, optional `metadata`) |
| POST | `/presence/heartbeat` | Player heartbeat while media is playing (`sessionId`, optional `metadata`) |
| POST | `/presence/end` | End a presence session (`sessionId`) |
| GET | `/presence/me` | Own resolved presence + active sessions |
| GET | `/profiles/:username/presence` | Viewer-aware resolved presence (profile visibility + presence prefs enforced server-side; `null` when nothing qualifies) |
| GET/PATCH | `/settings/presence` | Own presence preferences (`enabled`, `visibility`, `readerEnabled`, `playerEnabled`) |
| GET/PATCH | `/admin/system/presence` | Presence policy (`system.settings.read/write`): `enabled`, `readingRecencyHours` (default 48), `playbackDisconnectMinutes`, `pausedPlaybackGraceMinutes` |

No Books, Music, TV, or other media domain endpoints in Foundation.

## Media identity (Work entities)

Domain Work entities (Books today; Audiobooks, Movies, TV, etc. in future passes) expose two distinct identifiers:

| Field        | Role                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| `id`         | Immutable 6-character internal identity (`^[a-z0-9]{6}$`). Stable for client state, foreign keys, and mutations. |
| `slug`       | Persisted public routing identifier. Unique within the media domain table (e.g. `books.slug`).                   |
| `slugStatus` | `pending` or `canonical`.                                                                                        |

Public book routes use `:slug`, not `:id`. Resolution is `WHERE slug = $ref` — pending imports temporarily use their internal `id` as `slug` until metadata assigns a canonical slug.

API responses include all three fields. Title changes after `slugStatus === canonical` do not change the slug.

## Books endpoints

| Method                | Path                                    | Permission                   | Description                                                                                                                                   |
| --------------------- | --------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| GET                   | `/books`                                | `books.read`                 | Paginated library books (`q`, `author`, `series`, `genre`, `favorite`, `physicalOwned`, `physicalWithoutDigital`, `view`, `sort`, `cursor`)   |
| POST                  | `/books`                                | `books.write`                | Create book (Work + default WEM shell). Returns `{ id, slug, slugStatus }`.                                                                   |
| GET                   | `/books/physical-holdings`              | `books.read`                 | Current user's physical holdings (`withoutDigital=true` for holdings without a digital representation)                                        |
| POST                  | `/books/physical-holdings/by-isbn`      | `books.write`                | ISBN scan entry point: resolve manifestation/Work, then mark owned (idempotent; reconciles edition-unknown holdings)                          |
| GET                   | `/books/authors`                        | `books.read`                 | Authors in user's library                                                                                                                     |
| GET                   | `/books/series`                         | `books.read`                 | All series                                                                                                                                    |
| POST                  | `/books/import`                         | `books.write`                | Enqueue association for file IDs (`202`)                                                                                                      |
| GET                   | `/books/:slug`                          | `books.read`                 | Book detail with WEM tree, user state, and current user's `physicalHolding` (null when not physically owned)                                  |
| PATCH                 | `/books/:slug`                          | `books.write`                | Update canonical fields                                                                                                                       |
| DELETE                | `/books/:slug`                          | `books.write`                | Delete book Work (removes every user's physical holding for the Work)                                                                         |
| GET                   | `/books/:slug/deletion-preview`         | `books.write`                | Deletion confirmation summary (files, manifestations, physical holdings/users, Journal data, reviews, relationships)                          |
| GET/POST/PATCH/DELETE | `/books/:slug/physical-holding`         | `books.read` / `books.write` | Current user's physical holding (GET null when unowned; POST marks owned edition-unknown; PATCH identifies edition; DELETE removes ownership) |
| POST                  | `/books/:slug/membership`               | `books.write`                | Ensure library membership                                                                                                                     |
| PUT                   | `/books/:slug/authors`                  | `books.write`                | Replace authors                                                                                                                               |
| PUT                   | `/books/:slug/genres`                   | `books.write`                | Replace genres                                                                                                                                |
| PUT                   | `/books/:slug/series`                   | `books.write`                | Set series membership                                                                                                                         |
| PATCH                 | `/books/:slug/metadata`                 | `books.write`                | Adopt/lock canonical field via `MetadataCanonicalService` (`field`, `value`, optional `sourceKey`)                                            |
| PATCH                 | `/books/:slug/metadata/fields`          | `books.write`                | Bulk edit canonical fields from metadata editor (records Feylore provenance, locks fields)                                                    |
| GET                   | `/books/:slug/metadata/editor`          | `books.read`                 | Metadata source comparison matrix (tier-grouped imported vs providers)                                                                        |
| DELETE                | `/books/:slug/metadata/:field`          | `books.write`                | Clear field override (unlock)                                                                                                                 |
| POST                  | `/books/:slug/metadata/fetch`           | `books.write`                | Enqueue provider metadata refresh job                                                                                                         |
| POST                  | `/books/:slug/metadata/reextract`       | `books.write`                | Re-extract imported file metadata and re-merge non-overridden fields                                                                          |
| GET/POST/DELETE       | `/books/:slug/relationships`            | `books.read` / `books.write` | Creative work relationships                                                                                                                   |
| GET/PUT               | `/books/:slug/favorite`                 | `books.read` / `books.write` | User favorite                                                                                                                                 |
| GET/PUT               | `/books/:slug/rating`                   | `books.read` / `books.write` | User rating                                                                                                                                   |
| GET/PUT               | `/books/:slug/progress`                 | `books.read` / `books.write` | Work-primary reading progress (derived); PUT requires `representationId`                                                                      |
| GET/PUT               | `/representations/:id/reading-progress` | `books.read` / `books.write` | Representation-scoped reading progress                                                                                                        |
| GET/PUT               | `/reading-progress`                     | `books.read` / `books.write` | Query or upsert by `representationId` or `workType`+`workId`                                                                                  |
| POST                  | `/representations/:id/reading-activity` | `books.write`                | Record atomic reading activity (session grouping server-side)                                                                                 |
| GET                   | `/reading-activity`                     | `books.read`                 | List reading activity                                                                                                                         |
| GET                   | `/reading-sessions`                     | `books.read`                 | List reading sessions                                                                                                                         |
| GET/PATCH             | `/reading-sessions/:id`                 | `books.read` / `books.write` | Session detail / end session                                                                                                                  |

See [READING-PROGRESS.md](READING-PROGRESS.md) for architecture and conflict rules.
| GET | `/books/:slug/history` | `books.read` | User history events |
| GET/POST/DELETE | `/books/:slug/bookmarks` | `books.read` / `books.write` | Reader bookmarks |
| GET/POST/PATCH/DELETE | `/books/:slug/annotations` | `books.read` / `books.write` | Reader annotations |
| GET | `/books/:slug/shelves` | `books.read` | Shelves containing this book |
| GET | `/representations/:id/publication/manifest` | `books.read` | EPUB Readium manifest |
| GET | `/representations/:id/publication/resource` | `files.stream` | EPUB resource (`?path=`) |
| GET | `/files/unassociated` | `storage.read` | Files not linked to representations |

## Audiobooks endpoints

Audiobooks are a separate Work domain from Books. Listening progress uses the shared playback API (`/playback/progress`), not book-style `/progress` routes.

| Method          | Path                              | Permission                             | Description                                                                                                              |
| --------------- | --------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| GET             | `/audiobooks`                     | `audiobooks.read`                      | Paginated library audiobooks (`q`, `author`, `narrator`, `series`, `genre`, `favorite`, `view`, `sort`, `cursor`)        |
| POST            | `/audiobooks`                     | `audiobooks.write`                     | Create audiobook Work + default WEM shell                                                                                |
| GET             | `/audiobooks/authors`             | `audiobooks.read`                      | Authors in user's library                                                                                                |
| GET             | `/audiobooks/narrators`           | `audiobooks.read`                      | Narrators in user's library                                                                                              |
| GET             | `/audiobooks/series`              | `audiobooks.read`                      | All audiobook series                                                                                                     |
| POST            | `/audiobooks/import`              | `audiobooks.write`                     | Enqueue ingest for audio file IDs (`202`)                                                                                |
| GET             | `/audiobooks/:slug`               | `audiobooks.read`                      | Detail with WEM tree (manifestation ASIN, derived representation runtime) and user state                                 |
| PATCH           | `/audiobooks/:slug`               | `audiobooks.write`                     | Update canonical fields                                                                                                  |
| DELETE          | `/audiobooks/:slug`               | `audiobooks.write`                     | Delete audiobook Work                                                                                                    |
| POST            | `/audiobooks/:slug/membership`    | `audiobooks.write`                     | Ensure library membership                                                                                                |
| PUT             | `/audiobooks/:slug/authors`       | `audiobooks.write`                     | Replace authors                                                                                                          |
| PUT             | `/audiobooks/:slug/narrators`     | `audiobooks.write`                     | Replace narrators                                                                                                        |
| PUT             | `/audiobooks/:slug/genres`        | `audiobooks.write`                     | Replace genres                                                                                                           |
| PUT             | `/audiobooks/:slug/series`        | `audiobooks.write`                     | Set series membership                                                                                                    |
| PATCH           | `/audiobooks/:slug/metadata`      | `audiobooks.write`                     | Set field override (user metadata)                                                                                       |
| GET/POST/DELETE | `/audiobooks/:slug/relationships` | `audiobooks.read` / `audiobooks.write` | Related book Works (`related_edition`)                                                                                   |
| GET             | `/books/:slug/related`            | `books.read`                           | Bounded Related projection (`groups=semantic,people,series,representations`; default `semantic`; `limit` 1–50, `cursor`) |
| GET             | `/audiobooks/:slug/related`       | `audiobooks.read`                      | Bounded Related projection (`groups=semantic,people,series,representations`; default `semantic`; `limit` 1–50, `cursor`) |
| GET/PUT         | `/audiobooks/:slug/favorite`      | `audiobooks.read` / `audiobooks.write` | User favorite                                                                                                            |
| GET/PUT         | `/audiobooks/:slug/rating`        | `audiobooks.read` / `audiobooks.write` | User rating                                                                                                              |
| GET             | `/audiobooks/:slug/history`       | `audiobooks.read`                      | Listening history                                                                                                        |
| GET             | `/representations/:id/playback`   | `audiobooks.read`                      | Audio playback manifest (also used for other domains)                                                                    |

**Progress:** `GET/PUT /playback/progress?subjectType=audiobook&subjectId=...`

## Podcasts

| Method | Path                                            | Permission       | Description                                                     |
| ------ | ----------------------------------------------- | ---------------- | --------------------------------------------------------------- |
| GET    | `/podcasts`                                     | `podcasts.read`  | User's subscribed shows                                         |
| GET    | `/podcasts/discover`                            | `podcasts.read`  | Instance catalog (play without subscribe)                       |
| GET    | `/podcasts/continue-listening`                  | `podcasts.read`  | Episodes with in-progress playback                              |
| POST   | `/podcasts/subscribe`                           | `podcasts.write` | Subscribe to feed URL (`202` on create)                         |
| DELETE | `/podcasts/:slug/subscribe`                     | `podcasts.write` | Unsubscribe                                                     |
| GET    | `/podcasts/:slug`                               | `podcasts.read`  | Show detail + recent episodes                                   |
| GET    | `/podcasts/:slug/episodes`                      | `podcasts.read`  | Paginated episodes                                              |
| GET    | `/podcasts/:slug/episodes/:episodeSlug`         | `podcasts.read`  | Episode detail + `prepareStatus`                                |
| POST   | `/podcasts/:slug/episodes/:episodeSlug/prepare` | `podcasts.read`  | Ensure enclosure fetched; returns `representationId` when ready |

**Progress:** `GET/PUT /playback/progress?subjectType=podcast_episode&subjectId=...`

UI routes: `/audiobooks/podcasts`, `/audiobooks/podcasts/:slug`, `/audiobooks/podcasts/:slug/:episodeSlug`.

## Music

| Method  | Path                                     | Permission                   | Description                                                                             |
| ------- | ---------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| GET     | `/music/albums`                          | `music.read`                 | Paginated library albums (`q`, `artist`, `genre`, `favorite`, `view`, `sort`, `cursor`) |
| POST    | `/music/albums`                          | `music.write`                | Create album + library membership                                                       |
| GET     | `/music/artists`                         | `music.read`                 | Artists in user's library                                                               |
| GET     | `/music/genres`                          | `music.read`                 | Genres in user's library                                                                |
| POST    | `/music/albums/import`                   | `music.write`                | Enqueue ingest for audio file IDs (`202`)                                               |
| GET     | `/music/playlists`                       | `music.read`                 | User playlists                                                                          |
| POST    | `/music/playlists`                       | `music.write`                | Create playlist                                                                         |
| GET     | `/music/playlists/:slug`                 | `music.read`                 | Playlist detail with tracks                                                             |
| PATCH   | `/music/playlists/:slug`                 | `music.write`                | Update playlist metadata                                                                |
| DELETE  | `/music/playlists/:slug`                 | `music.write`                | Delete playlist                                                                         |
| POST    | `/music/playlists/:slug/tracks`          | `music.write`                | Add track to playlist                                                                   |
| DELETE  | `/music/playlists/:slug/tracks/:trackId` | `music.write`                | Remove track from playlist                                                              |
| PUT     | `/music/playlists/:slug/reorder`         | `music.write`                | Reorder playlist tracks                                                                 |
| GET     | `/music/artists/:slug`                   | `music.read`                 | Artist detail with accessible albums                                                    |
| GET     | `/music/tracks/:trackId`                 | `music.read`                 | Track detail + user state                                                               |
| GET     | `/music/albums/:slug`                    | `music.read`                 | Album detail with tracks and user state                                                 |
| PATCH   | `/music/albums/:slug`                    | `music.write`                | Update album metadata                                                                   |
| DELETE  | `/music/albums/:slug`                    | `music.write`                | Delete album                                                                            |
| POST    | `/music/albums/:slug/membership`         | `music.write`                | Ensure library membership                                                               |
| PUT     | `/music/albums/:slug/artists`            | `music.write`                | Replace album artists                                                                   |
| PUT     | `/music/albums/:slug/genres`             | `music.write`                | Replace album genres                                                                    |
| PATCH   | `/music/albums/:slug/metadata`           | `music.write`                | Set field override (user metadata)                                                      |
| GET/PUT | `/music/albums/:slug/favorite`           | `music.read` / `music.write` | User favorite                                                                           |
| GET     | `/music/albums/:slug/history`            | `music.read`                 | Listening history                                                                       |
| GET     | `/music/albums/:slug/playback`           | `music.read`                 | Track playback manifests for album                                                      |
| GET     | `/music/albums/:slug/tracks`             | `music.read`                 | Album track list                                                                        |
| POST    | `/music/albums/:slug/tracks`             | `music.write`                | Create track on album                                                                   |
| DELETE  | `/music/albums/:slug/tracks/:trackSlug`  | `music.write`                | Delete track                                                                            |

**Progress:** `GET/PUT /playback/progress?subjectType=track&subjectId=...`

UI routes: `/music`, `/music/albums/:slug`, `/music/artists/:slug`, `/music/tracks/:trackId`.

## Creative identity (People)

Shared canonical identity for authors, narrators, artists, cast/crew, and other creative entities. Entity type is `person` \| `group` \| `organization`. Global profile route is `/people/:slug`.

Author, narrator, and artist associations on books, audiobooks, and albums resolve names into canonical People entities and write `person_credits` (role-scoped, e.g. `author`, `narrator`, `artist`). Book/audiobook detail responses expose `peopleId` and `peopleSlug` per author/narrator for `/people/:slug` links. Contextual grids filter by role.

| Method            | Path                                          | Permission        | Description                                                                                                                           |
| ----------------- | --------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| GET               | `/people`                                     | `books.read`      | Paginated canonical entities (`page`, `size`, `sort`, `letter`, `entityType`)                                                         |
| GET               | `/people/:slug`                               | `books.read`      | Canonical profile (bio, photo, credits grouped by target type, relationships, provider identifiers)                                   |
| GET               | `/people/:slug/metadata/editor`               | `books.read`      | Person metadata editor payload (canonical field rows with values/provenance, enabled provider columns, links, identifiers, providers) |
| PATCH             | `/people/:slug/metadata`                      | `people.write`    | Set one canonical field, optionally adopting a provider value via `sourceKey` (locks the field)                                       |
| PATCH             | `/people/:slug/metadata/fields`               | `people.write`    | Bulk set of `{ fieldId, value }` entries (empty/null clears scoped fields)                                                            |
| PATCH             | `/people/:slug/metadata/lock`                 | `people.write`    | Lock or unlock a canonical field (`{ fieldId, lock }`)                                                                                |
| DELETE            | `/people/:slug/metadata/:field`               | `people.write`    | Unlock a field: clear override and provenance                                                                                         |
| POST              | `/people/:slug/metadata/fetch`                | `people.write`    | Enqueue evidence-only person metadata fetch (`202` returning `jobId`; existing active job is reused)                                  |
| POST              | `/people/:slug/photos/adopt`                  | `people.write`    | Download a portrait URL into managed storage (`{ url, sourceKey? }`)                                                                  |
| DELETE            | `/people/:slug/photos`                        | `people.write`    | Remove the managed portrait                                                                                                           |
| PATCH             | `/people/:slug/identity`                      | `people.write`    | Edit identity fields (name, sortName, alternateNames, bio, pronouns, personalUrl, birth/death dates and places)                       |
| GET               | `/people/:slug/links`                         | `books.read`      | List person links                                                                                                                     |
| POST/PATCH/DELETE | `/people/:slug/links[/:linkId]`               | `people.write`    | Add, update, or remove a person link                                                                                                  |
| POST/DELETE       | `/people/:slug/identifiers[/:provider]`       | `people.write`    | Add or remove a provider identifier (e.g. Wikidata QID)                                                                               |
| GET               | `/people/:slug/duplicates`                    | `books.read`      | Duplicate candidates (name/sort-name matching with credit counts)                                                                     |
| POST              | `/people/:slug/merge`                         | `people.write`    | Merge `duplicatePeopleId` into this person (credits, links, identifiers, metadata, provenance moved; source row deleted)              |
| DELETE            | `/people/:slug/credits/:targetType/:targetId` | `people.write`    | Remove a credit (optional `role` query param)                                                                                         |
| GET               | `/books/authors/people`                       | `books.read`      | Canonical entities with book `author` credits (ordered grid)                                                                          |
| GET               | `/audiobooks/authors/people`                  | `audiobooks.read` | Canonical entities with audiobook `author` credits                                                                                    |
| GET               | `/audiobooks/narrators/people`                | `audiobooks.read` | Canonical entities with audiobook `narrator` credits                                                                                  |
| GET               | `/music/artists/people`                       | `music.read`      | Canonical entities with album `artist` credits                                                                                        |
| GET               | `/movies/people/list`                         | `movies.read`     | Canonical entities with movie cast/crew credits                                                                                       |

UI routes: `/people/:slug/edit`, `/people/:slug`, `/books/authors`, `/audiobooks/authors`, `/audiobooks/narrators`, `/music/artists/people`, `/movies/people/list` (the legacy `/books/authors/people`, `/audiobooks/narrators/people` URLs redirect to the rebuilt grids).

Responses are paginated `{ items, pagination, availableLetters }` with `PeopleEntityCard` items for grids, and a full `PeopleEntityProfile` for `/people/:slug`.

Person metadata editing follows the same interaction model as the Book metadata editor: current Feylore value, per-provider values, provenance, and per-field locks, with three states (stored in Feylore, fetched from provider, fetched-but-not-applied). Fetches are evidence-only — provider records never auto-merge into the person row. The fetch job type is `metadata.person.fetch` (`JOB_TYPES.PERSON_METADATA_FETCH`) and the first provider is Wikidata (auto-enabled, no configuration required).

## Movies

| Method           | Path                                        | Permission                     | Description                                                                   |
| ---------------- | ------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| GET              | `/movies`                                   | `movies.read`                  | Paginated library movies (`q`, `genre`, `favorite`, `view`, `sort`, `cursor`) |
| POST             | `/movies`                                   | `movies.write`                 | Create movie + library membership                                             |
| GET              | `/movies/genres`                            | `movies.read`                  | Genres in user's library                                                      |
| POST             | `/movies/import`                            | `movies.write`                 | Enqueue ingest for video file IDs (`202`)                                     |
| GET/POST         | `/movies/collections`                       | `movies.read` / `movies.write` | List or create collections                                                    |
| GET/PATCH/DELETE | `/movies/collections/:slug`                 | `movies.read` / `movies.write` | Collection detail CRUD                                                        |
| POST             | `/movies/collections/:slug/movies`          | `movies.write`                 | Add movie to collection                                                       |
| DELETE           | `/movies/collections/:slug/movies/:movieId` | `movies.write`                 | Remove movie from collection                                                  |
| PUT              | `/movies/collections/:slug/reorder`         | `movies.write`                 | Reorder movies in collection                                                  |
| GET              | `/movies/people/:slug`                      | `movies.read`                  | Person detail with filmography                                                |
| GET              | `/movies/:slug`                             | `movies.read`                  | Movie detail with representations and user state                              |
| PATCH            | `/movies/:slug`                             | `movies.write`                 | Update movie metadata                                                         |
| DELETE           | `/movies/:slug`                             | `movies.write`                 | Delete movie Work (representations removed; other movies unaffected)          |
| POST             | `/movies/:slug/membership`                  | `movies.write`                 | Ensure library membership                                                     |
| PUT              | `/movies/:slug/genres`                      | `movies.write`                 | Replace genres                                                                |
| PUT              | `/movies/:slug/credits`                     | `movies.write`                 | Replace cast/crew credits                                                     |
| PATCH            | `/movies/:slug/metadata`                    | `movies.write`                 | Set field override (user metadata)                                            |
| GET/PUT          | `/movies/:slug/favorite`                    | `movies.read` / `movies.write` | User favorite                                                                 |
| GET/PUT          | `/movies/:slug/rating`                      | `movies.read` / `movies.write` | User rating                                                                   |
| GET              | `/movies/:slug/playback`                    | `movies.read`                  | Playback manifest for primary video representation                            |

**Progress:** `GET/PUT /playback/progress?subjectType=movie&subjectId=...`

UI routes: `/movies`, `/movies/browse`, `/movies/:slug`, `/movies/collections/:slug`, `/movies/people/:slug`.

## TV

| Method           | Path                                               | Permission             | Description                                                                  |
| ---------------- | -------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| GET              | `/tv/shows`                                        | `tv.read`              | Paginated library shows (`q`, `genre`, `favorite`, `view`, `sort`, `cursor`) |
| POST             | `/tv/shows`                                        | `tv.write`             | Create show + library membership                                             |
| GET              | `/tv/genres`                                       | `tv.read`              | Genres in user's library                                                     |
| POST             | `/tv/import`                                       | `tv.write`             | Enqueue ingest for video file IDs (`202`)                                    |
| GET/PATCH/DELETE | `/tv/shows/:slug`                                  | `tv.read` / `tv.write` | Show detail CRUD                                                             |
| POST             | `/tv/shows/:slug/membership`                       | `tv.write`             | Ensure library membership                                                    |
| GET/PUT          | `/tv/shows/:slug/favorite`                         | `tv.read` / `tv.write` | Show favorite (not episode-level)                                            |
| GET/PUT          | `/tv/shows/:slug/rating`                           | `tv.read` / `tv.write` | Show rating (not episode-level)                                              |
| GET/POST         | `/tv/shows/:slug/seasons`                          | `tv.read` / `tv.write` | List or create seasons                                                       |
| GET              | `/tv/shows/:slug/s/:seasonNumber`                  | `tv.read`              | Season detail with episodes and progress                                     |
| GET              | `/tv/shows/:slug/s/:seasonNumber/e/:episodeNumber` | `tv.read`              | Episode detail (`sortOrder` query optional)                                  |
| GET              | `/tv/episodes/:id/playback`                        | `tv.read`              | Playback manifest for episode representation                                 |
| GET/POST         | `/tv/live/playlists`                               | `tv.read` / `tv.write` | List or create Live TV playlists                                             |
| POST             | `/tv/live/playlists/:id/sync`                      | `tv.write`             | Sync M3U playlist (`202`)                                                    |
| GET              | `/tv/live/playlists/:id/channels`                  | `tv.read`              | Channels in playlist                                                         |
| GET              | `/tv/live/channels/:id`                            | `tv.read`              | Channel detail                                                               |
| GET              | `/tv/live/channels/:id/playback`                   | `tv.read`              | Live stream manifest (`sessionMode: persistent`)                             |

**Episode progress:** `GET/PUT /playback/progress?subjectType=tv_episode&subjectId=...` (shared playback API only).

UI routes: `/tv`, `/tv/browse`, `/tv/shows/:slug`, `/tv/shows/:slug/s/:season`, `/tv/shows/:slug/s/:season/e/:episode`, `/tv/live`, `/tv/live/:channelId`.

## File streaming contract

Authorization occurs **before** opening the underlying file. Errors never expose filesystem paths.

### HEAD `/files/:id/content`

Returns headers only after authorization: `Content-Type`, `Content-Length`, `Accept-Ranges: bytes`, `ETag`.

### GET `/files/:id/content`

- Full body: `200 OK` with `Content-Length`, `Content-Type`, `Accept-Ranges`, `ETag`
- Range: client sends `Range: bytes=start-end`
  - Valid: `206 Partial Content` with `Content-Range: bytes start-end/total`
  - Invalid: `416 Range Not Satisfiable`
- Conditional: `If-None-Match` / `If-Modified-Since` → `304 Not Modified` when applicable

`Content-Type` from server-detected type, not client-provided.

## Processing administration

Per-module ingest policy is stored in `system_settings` under `processing.policies`. Policy is keyed by `ProcessingModuleId`: `books`, `comics`, `movies`, `tv`, `audiobooks`, `podcasts`, `music`.

Each `ModuleProcessingPolicy` includes:

- `metadataProcessingEnabled`
- `titleTemplate` / `pathTemplate` (separate title vs folder templates)
- `fileOperations`: `renameFiles`, `organizeIntoLibrary`
- `conversion`: `enabled`, `target` (`epub-3.3` for books only; comics default to disabled)
- `readAlong`: books only (`enabled`)
- `originalRetention`: `enabled`, `archiveFormat` (`tar.gz`), `archiveDestinationIntent` (`originals` | `archive`)

Destination mounts are resolved from storage intent (not stored as `storageLocationId` in policy).

| Method | Path                                     | Permission              |
| ------ | ---------------------------------------- | ----------------------- |
| GET    | `/processing/modules`                    | `system.settings.read`  |
| GET    | `/processing/policies`                   | `system.settings.read`  |
| GET    | `/processing/policies/:moduleId/preview` | `system.settings.read`  |
| PATCH  | `/processing/policies/:moduleId`         | `system.settings.write` |

`GET /processing/policies` and `GET /processing/modules` return enabled modules with resolved destination, capabilities, and effective policy.

## Background jobs

Enqueue: `POST` → `202 Accepted` with `{ "data": { "jobId": "..." } }`.

Poll: `GET /jobs/:id`.

Cancel: `POST /jobs/:id/cancel` (queued or cooperative running cancel).

## Home

`GET /home` returns a single aggregated feed for the authenticated user. Section limits are enforced server-side (continue rails: 12 each; recently added/finished/favorites: 12; activity: 8; shelves: 6). Empty sections return `[]`.

Response shape (`HomeResponse`):

```json
{
  "data": {
    "isEmpty": false,
    "sections": {
      "continueReading": [],
      "continueListening": [],
      "recentlyPlayedMusic": [],
      "recentlyAddedAlbums": [],
      "recentlyAdded": [{ "domain": "book", "item": {} }],
      "recentlyFinished": [],
      "favorites": [],
      "recentActivity": [],
      "shelves": [{ "shelf": {}, "coverFileIds": [], "itemCount": 0 }],
      "shortcuts": [{ "key": "search", "href": "/search" }],
      "recommendations": []
    }
  }
}
```

`isEmpty` is `true` only when no meaningful library/activity state exists across content sections (not merely zero memberships). Public shelves owned by other users do not prevent the welcome state; only the current user's own shelves count toward `isEmpty`. `recommendations` is reserved for a future provider and is always `[]` in V1.

## Book ratings and reviews

The five-step modal uses `GET /books/:slug/review/config` and `GET /books/:slug/review`. Both require Books read permission and access to the book. Configuration reports external account authorization for the current user.

`PUT /books/:slug/review` saves a draft with optional `coreValues`, `genreValues`, `trajectory`, `recommendation`, `finalRating`, `summary`, and `review`. Omitted fields retain their values; explicit `null` clears nullable fields. `finalRating` is nullable in drafts and uses the existing 1–10 rating range. Draft saving recalculates `suggestedRating` without replacing `finalRating` and sets status to `draft`, including when editing a previously completed review.

`PUT /books/:slug/review/finalize` explicitly completes the review with a final rating. `POST /books/:slug/review/external/:providerKey` is a separate, explicit operation requiring a completed review and the user's configured provider connection. `DELETE /books/:slug/review` removes the review. These mutations require Books write permission and access to the book. Saving or navigating the modal never implicitly posts externally.

## Activity feed

`GET /activity` returns the authenticated user's events. Cursor pagination: `?cursor=<ISO8601>&limit=50` (max 100). Response includes `page.nextCursor` when more results exist.

## Notifications

All notification endpoints require `notifications.read.own` (all roles except none). `POST /admin/notifications` requires `notifications.send` (admin only). Full design: [NOTIFICATIONS.md](NOTIFICATIONS.md).

`GET /notifications?cursor=&limit=&type=` returns the authenticated user's notifications, most recent first. `type` filters by a stable notification type key (e.g. `club.mention`). Cursor pagination uses ISO 8601 `createdAt`; `page.nextCursor` is present when more results exist.

`GET /notifications/unread-count` returns `{ data: { count } }`.

`POST /notifications/:id/read` marks a notification read (and seen). `POST /notifications/:id/seen` marks it seen. Both 404 when the notification does not belong to the user. `POST /notifications/read-all` marks all notifications read and returns `{ data: { updated } }`.

`GET /settings/notifications` returns notification settings: `{ data: { preferences: [{ type, category, enabled, emailEnabled }], paused, emailAvailable } }`. `enabled` is the In-app toggle; `emailEnabled` opts a type into email delivery and defaults to false; `emailAvailable` reports whether the server's SMTP channel is configured (server capability, not user state). `paused` is the global delivery pause. `PATCH /settings/notifications` accepts a partial body — `{ preferences: [{ type, enabled?, emailEnabled? }] }`, `{ paused: boolean }`, or both. Each preference item must set at least one of `enabled`/`emailEnabled`; the whole body must set at least one of `preferences`/`paused`; unknown types are rejected. Returns the same `{ data: { preferences, paused, emailAvailable } }` shape.

`POST /admin/notifications` publishes a system announcement. Body: `{ title, body?, target: "admins" | "users" }`. `admins` delivers to users with administrator access; `users` delivers to every user.

Notification emails are sent asynchronously through the `notification.email` pg-boss job (`POST /admin/notifications` and other sources enqueue only when the recipient has `emailEnabled` for the type and `SMTP_*` is configured).

## Achievements

Definition management has no HTTP surface by design: definitions are created through the owning feature (Goals own their `completed` achievement today; Challenges and Clubs can register their own sources later). Full design: [ACHIEVEMENTS.md](ACHIEVEMENTS.md).

When the Achievements feature module is disabled, every endpoint below returns 404 and profile surfaces hide the section; stored definitions and grants are retained.

`GET /achievements/me?limit=&offset=` returns the authenticated user's earned achievements, oldest first, with `{ data: { items, total } }`. `GET /achievements/me/recent?limit=` (default 10, max 100) returns newest first for compact surfaces. `GET /achievements/me/count` returns `{ data: { count } }`. `GET /achievements/me/definitions/:definitionId` returns the user's grant of one definition, or 404 when unearned.

Profile surfaces: `GET /profiles/:username/achievements?limit=&offset=`, `GET /profiles/:username/achievements/recent?limit=`, `GET /profiles/:username/achievements/count`, and `GET /profiles/:username/achievements/definitions/:definitionId`. All require the viewer to see the target profile (private profiles 404); grants whose source is not visible to the viewer (e.g. a private goal, or a private club once Clubs own achievements) are excluded from lists, counts, and single-grant lookups. The viewer profile view (`GET /profiles/:username/full`) includes `recentAchievements` (up to 6, source-visibility filtered; `[]` when the module is disabled).

## Search

`GET /search?q=...&types=book&cursor=...` returns entity matches. Book results include `slug` and `href` for navigation. Audiobook results use `href: /audiobooks/{slug}`. Music results use `href: /music/albums/{slug}`, `/music/artists/{slug}`, or `/music/tracks/{trackId}`.

## Clubs revision foundation

The incremental Club Read and Selection Round endpoints, authorization rules, migration behavior and current implementation boundary are documented in [CLUBS-REVISION-IMPLEMENTATION.md](CLUBS-REVISION-IMPLEMENTATION.md). Existing Club endpoints remain available during migration.

Clubs reading surfaces: GET `/clubs/:id/library`, GET `/clubs/:id/reads/:readId/experience`, POST `/clubs/:id/reads/:readId/check-in` (`{checkedIn:boolean}`). See [Clubs implementation checkpoint](CLUBS-REVISION-IMPLEMENTATION.md).

Club administration: PATCH `/clubs/:id/defaults` (owner or delegated moderator) persists reading duration and future Selection Round defaults; GET `/clubs/:id` includes those defaults only for administrators. GET `/upcoming` returns a domain-neutral dated-event shape, currently populated by authorized Club events for the global Upcoming section. `POST /clubs/:id/schedules` accepts `eventKind: "final_discussion"` for a one-time schedule linked to a Club Read; other occurrences remain check-ins. New Selection Round creation copies the then-current defaults, and the worker sweeps persisted deadlines after restart.

Clubs Discussions: GET `/clubs/:id/topics/index?clubReadId=...&cursor=...&quoteCursor=...&unread=true` returns bounded structural groups (50 topic summaries) and shared passages (20), with independent `nextCursor` and `nextPassageCursor`. Without a read ID it includes General and the active read. POST `/clubs/:id/topics` accepts optional `clubReadId`, structural `mediaLocation`, `sourceAnnotationId`, `sharedQuoteId` or canonical `readerLocator`; the authenticated member owns the new discussion. POST `/clubs/:id/quotes` accepts explicit owned annotation or manual text, optional read/location and canonical reader locator. DELETE `/clubs/:id/quotes/:quoteId` unshares without changing the source Journal or deleting linked discussions. All content routes project protected text on the server. See [the implementation checkpoint](CLUBS-REVISION-IMPLEMENTATION.md) for exact rules and snapshot lifecycle.
