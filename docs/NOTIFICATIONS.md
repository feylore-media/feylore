# Notifications

Notifications 1.0 — Foundation. This document describes the notification
architecture for Feylore: what the foundation owns, how features publish
notifications without coupling themselves to the notification subsystem, and
the API surface.

**Status:** Foundation (1.0), product surface (1.1), preferences (1.2), and
the email delivery channel (1.3) are implemented. Future work: email digests,
webhook/push channels, and anything beyond the current type registry. No
additional pending 1.x passes are on the books.

> Migration note: 1.3 required **no schema change** — the email-per-type flag
> (`user_notification_preferences.email_enabled`) already existed from the
> foundation and only awaited a delivery channel.

## Principles

- **Features emit domain events; they never construct notifications.**
  A feature knows it happened (`club.mention.created`, `system.announcement`).
  Turning an event into a per-user notification (title, body, recipients,
  dedupe, aggregation) is the responsibility of a notification **source**.
- **Writing a notification is not an action the feature blocks on.**
  Delivery runs through an in-process event bus; a failing handler is logged
  and never fails the raising request.
- **Notifications are per-user rows with explicit read/seen state.** Unread vs
  seen are distinct. `readAt` implies seen.
- **Delivery is idempotent per (recipient, dedupeKey).** Republishing the same
  event must not duplicate a notification. Dedupe never resets read state.
- **Preferences are per user, per stable type key**, stored in
  `user_notification_preferences`; a missing row means the type's default.

## Stable type registry

`src/shared/notifications.ts` is the single source of truth for notification
types, used by both the server (schema FK target, seed, service) and the client
(i18n, rendering). A type is:

| Key                  | Category | Default | Meaning                                       |
| -------------------- | -------- | ------- | --------------------------------------------- |
| `club.mention`       | club     | enabled | Someone mentioned you in a club discussion    |
| `system.announcement`| system   | enabled | Announcement published by the administrator   |

`notification_types` (seeded from the catalog) is a stable registry keyed by
`key`; deleting a type is restricted while notifications reference it. UI labels
live in i18n under the `notifications` namespace, keyed by each type's
`labelKey` — the server stores rendered English title/body plus a structured
payload, not UI strings.

## Domain events and sources

- `DomainEventBus` (`src/server/modules/notifications/events.ts`): in-process
  pub/sub. `publish(type, payload, { actorUserId })` is non-fatal.
- `NotificationSource` (`sources.ts`): `resolve(event) → NotificationDraft[]`.
- `NotificationSourceRegistry` maps event type → source.
- `registerNotificationSource(bus, registry, service, source)` registers a
  source and subscribes it to the bus.
- `NotificationService.notifyFromEvent(event)` routes an event, resolves
  recipient ids, applies preferences and privacy rules, and persists rows.

Recipient rules (`RecipientRule`): explicit `users`, `permission`, `role`, or
`all`. Disabled users (`users.disabled_at`) are always excluded. The current
actor is excluded via `excludeUserIds`.

### Sources

**`club.mention`** — event `club.mention.created`, published by
`ClubDiscussionService.createTopic` / `createPost` after the transaction for
mentions validated to be club members. The source:

- verifies the club and topic still exist (delivery of a stale event is a
  no-op),
- delivers only to **current club members** (leaving a club is a privacy
  boundary: mention notifications stop), excluding the actor,
- dedupes per `club-mention:{postId}` / `club-mention:topic:{topicId}`,
- links to `/clubs/{clubId}/topics/{topicId}`.

**`system.announcement`** — event `system.announcement`, published by
`POST /admin/notifications`. The source delivers to administrators (members who
hold `system.settings.read`) or to all users; each announcement dedupes by
event id.

## Delivery rules

For each recipient, in order:

1. Resolve recipient ids (rule) and exclude disabled users + `excludeUserIds`.
2. Apply the per-type preference (missing preference → catalog default).
3. **Dedupe:** if a notification with the same `dedupeKey` already exists for
   this recipient, skip.
4. **Aggregation:** if `aggregateKey` matches an existing unread notification
   of the same type for this recipient, increment `aggregated_count` and
   refresh title/body/href instead of inserting.
5. Otherwise insert.

## Schema

- `notification_types(key, labelKey, description, category, defaultEnabled, createdAt)`
- `user_notification_preferences(userId, typeKey, enabled, emailEnabled, updatedAt)` — composite PK `(userId, typeKey)`
- `notifications(id, recipientUserId, type, title, body, href, actorUserId,
  subjectType, subjectId, payload, dedupeKey, aggregateKey, aggregatedCount,
  readAt, seenAt, hidden, createdAt, updatedAt)`

Indexes: unique `(recipientUserId, dedupeKey)`, `(recipientUserId, createdAt)`,
partial `(recipientUserId)` where `readAt IS NULL` (unread badge).

`hidden` suppresses a notification without deleting it (e.g. referenced topic
removed). `hideBySubject(subjectType, subjectId)` supports that housekeeping.

## API

All endpoints require `notifications.read.own` except `POST /admin/notifications`
which requires `notifications.send`. Ownership is enforced server-side; marking
another user's notification returns 404.

- `GET /notifications?cursor=&limit=&type=`
- `GET /notifications/unread-count`
- `POST /notifications/:id/read`
- `POST /notifications/:id/seen`
- `POST /notifications/read-all`
- `GET /settings/notifications` / `PATCH /settings/notifications`
- `POST /admin/notifications`

See `docs/API.md` → Notifications for contract details.

## Product surface (1.1)

The in-app UI is driven by the shared presentation layer and a small set of
hooks; no notification feature reaches into the API client directly.

**Presentation layer** (`src/web/components/account/notification-display.ts`)
owns formatting shared between the header popover and the notifications page:
badge text (`formatBadgeCount`: exact ≤ 9, `9+` < 100, `99+` ≥ 100), relative
time, absolute time (row `title`), calendar-day labels and day grouping, and
per-type labels.

**Shared row** (`components/account/NotificationItem.tsx`) renders a
notification with actor avatar (or a type tile fallback: `club.mention` →
club icon, `system.announcement` → info icon), type label, relative time, the
`+N` aggregation extra, and unread emphasis. `href` renders as a navigable
link; otherwise activation is an app action handled by the parent.

**Header badge + account popover** (`components/account/AccountMenu.tsx`,
`AccountNotificationPreview.tsx`) fetch the unread count and the 5 most recent
notifications. The badge shows `formatBadgeCount(unreadCount)`; opening the
popover refreshes the preview and marks displayed items seen (`seen` never
clears the badge). Each unread row is marked read on activation. The trigger's
`aria-label` includes the unread count.

**Notifications page** (`/notifications`,
`app/pages/NotificationsPage.tsx`) pages through the list with the `createdAt`
cursor, groups rows by calendar day, marks rows read on activation, exposes
"Mark all read", and shows loading/error/empty states.

**Hooks** — `useNotificationsPreview` (badge count + 5-item preview, 30-second
unread poll) and `useNotificationsList` (page list with cursor pagination)
wrap `app/notifications-api.ts`.

**Tests:** `tests/notifications.test.ts` covers the API surface including the
creation cursor pagination shape, `actorAvatarUrl` exposure (with a seeded
storage location/file fixture), and the seen-vs-read distinction;
`tests/notification-display.test.ts` covers the presentation layer's pure
functions (badge thresholds, day grouping, relative/absolute time, type
labels).

**Delivery-channel boundary:** the 1.1 surface deliberately stays in-app only.
Structured payloads, actor/subject identity, the stable type registry, and
source rendering mean a future email/webhook/DM delivery channel can be added
without reshaping the domain model.

## Preferences (1.2)

**Settings → Notifications** (`app/pages/SettingsNotificationsPage.tsx`)
renders from the type catalog, not hardcoded lists: category sections follow
`NOTIFICATION_CATEGORY_ORDER` and every registered type appears in its
category with a user-facing name (`nameKey`, e.g. "Mentions") and a
short description. Each type has an **In-app** toggle and, since 1.3, an
**Email** toggle (see below). Every type is a row: name and description on
the left, aligned In-app/Email channel columns on the right, so the matrix
stays scannable as a category grows to several types. The **Pause
notifications** control sits in a separate card above the matrix because it
is an account-wide override, not a per-type preference; while paused, rows
show their configured states, not a visually "off" preference.

**Pause control:** a top-level **Pause notifications** toggle suppresses new
delivery while leaving existing unread notifications intact. Persisted as
`user_preferences.notifications_paused` (migration `0050_notifications_pause`).
Delivery filters paused recipients unless the type is marked `mandatory` in
the catalog; no current type is mandatory, but the flag reserves the boundary
for future truly-critical types that must always land. Restoring a preference
never requires re-creating a pause state — pause and per-type toggles are
independent dimensions.

**Channel boundary without dead UI:** pre-1.3, no channel controls beyond
In-app were rendered. 1.3 exposes the dormant `email_enabled` column the
foundation seeded; webhook/push still have no schema or UI. Adding a channel
keeps the same preference meaning (`enabled` for the primary channel, channel
flags per type).

**API:** `GET /settings/notifications` returns
`{ data: { preferences, paused, emailAvailable } }`. `PATCH` accepts a partial
body of `preferences` and/or `paused` (at least one required); each
preference item must set `enabled` and/or `emailEnabled`. Both require
`notifications.read.own`.

**Tests:** `tests/notifications.test.ts` covers the settings response shape,
pause + per-type persistence, empty-body rejection, email-only patches, and
pause suppression on delivery; `tests/notification-settings.test.ts` covers
the pure presentation helpers (category grouping/order, user-facing names,
minimal per-channel PATCH diff).

## Email delivery channel (1.3)

**Delivery shape:** notifications remain rows in `notifications`; email is a
*second surface* for the fresh-row event. After a row is INSERTED, delivery
is offered to a channel dispatcher (`NotificationChannelService`) injected
into `NotificationService`. Fresh inserts only — deduped replays and
aggregate-merge refreshes `aggregatedCount+1` are not re-emailed. The service
never knows the channel; `PgBossEmailChannel` in
`src/server/modules/notifications/channels.ts` owns its gating: it enqueues a
`notification.email` pg-boss job only when the server's SMTP is configured
(`mail.isConfigured()`) **and** the recipient has `emailEnabled` for the type.
A missing preference row means email is off (the conservative default).

Workers (`registerJobHandlers`) handle `notification.email` via
`runNotificationEmail`: it reads the row + recipient from the database (never
the job payload), renders plain-text/HTML through
`renderNotificationEmail` (`src/server/modules/notifications/email-render.ts`,
pure, escapes HTML, only links root-relative `href`s against `APP_URL`), and
sends through `MailService.send` (nodemailer/SMTP). Missing rows/recipients
complete as skipped; send failures are recorded on the job run and rethrown
so pg-boss retries. Each mail's failure/completion is observable and
recoverable in job runs, satisfying the background-jobs requirement.

**Settings UI:** each type row shows an In-app and an Email toggle in aligned
columns. When the API reports `emailAvailable: false`, the Email toggles
render disabled and a single compact notice near the delivery controls reads
"Email notifications unavailable — Your administrator hasn't configured email
delivery for this server." (not a per-row repetition of SMTP specifics). The
feature is discoverable before an admin ever configures SMTP, but never
appears as a dead "working" control. Labels and descriptions use user-facing
wording ("Announcements … your Feylore administrator"), never i18n keys or
server-architecture terms.

**Pause + email:** pause suppression happens before channel dispatch, so a
paused user gets neither an in-app row nor an email (unless a future type is
`mandatory`). Opting into email is independent of pause and of the In-app
toggle.

**Boundaries deferred to later passes:** email digests/batching based on
`aggregatedCount`; per-type frequency limits; webhook and push channels;
`List-Unsubscribe`; bounce handling.

## Extending

To add a notification type: define it in `src/shared/notifications.ts` (catalog
entry controls the FK seed), emit a domain event from the feature module, and
add a source implementing `NotificationSource`. No changes to the service or
read/seen endpoints are required.