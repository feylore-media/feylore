# Calendar & Upcoming

Feylore's Calendar is the single authorized "what is coming" architecture. It
reconciles `docs/V1-SCOPE.md` ("No second calendar architecture is authorized",
line ~617) and the deferred `docs/todo.md` item for non-club upcoming providers:
there is exactly **one** calendar system (`src/server/modules/calendar`), one
event model (`UpcomingEvent` in `src/shared/upcoming.ts`), one API surface
(`/api/v1/calendar*`), and one user-facing page (`/calendar`).

## Scope (V1 first pass)

In V1 the Calendar shows **release dates derived from the user's own library
records**, plus **club schedule events** the user already belongs to.

| Source | Provider | What is shown |
|--------|----------|---------------|
| `library.book` | Book metadata + overrides | Upcoming `publicationDate` releases |
| `library.audiobook` | Audiobook metadata + overrides | Upcoming `releaseDate` releases |
| `library.music` | Albums | Upcoming album release dates |
| `library.movie` | Movies | Upcoming movie release dates |
| `library.tv` | TV shows + episodes | Show premieres, season premieres, dated episodes |
| `library.podcast` | Podcast subscriptions | Dated upcoming episodes |
| `club` | Book club schedules | Check-ins, discussions, final discussions, read windows |

Not in V1: follow/wishlist/userIntent features in the UI, notifications, saved
searches, subscriptions, iCal/RSS export, TTRPG release metadata (no provider).

`reasons`, `userIntent`, `discoveredAt`/`updatedAt`, and stable event ids are
modeled now so those features can attach without reshaping the contract.

## Why the "My Calendar" dimension exists

An event is present for the current user for a **reason**: it is in their
library (`sources=library`), or their club has scheduled it (`sources=club`).
This is a separate dimension from "which media domains to show". Media filters
(`media=books,movies,tv`) pick domains; the source picker (`sources=`) picks
reasons. Never conflate the two. Toggling off every reason or every media
domain means "show all" for that dimension.

## Event model

`UpcomingEvent` (`src/shared/upcoming.ts`) is the canonical, authorized
projection from a domain's own records. Key rules:

- **Never fabricate precision.** A release known only to a month keeps
  `releaseDate: null` with `datePrecision: "month"` and
  `releaseBucket: "2026-09"` for sorting/grouping. Day-precision releases are
  `status: "confirmed"`; partial dates are `tentative`. Unknown/TBA dates are
  filtered out of results.
- `startsAt` is populated **only** for instants (`timestamp`) and legacy
  club day events. Release events always carry `startsAt: null`; the UI groups
  with `eventDay()`/`eventSortKey()`.
- Event `id` is a stable, deterministic string derived from
  `[source, kind, workId, bucket]` so refetching never reorders or recreates
  identity.
- Covers are referenced by `artworkFileId` and served through the
  authorization-aware `GET /api/v1/files/:id/content` endpoint — never through
  a raw storage path.

### Date parsing

`parseReleaseDate` (`src/shared/calendar.ts`) classifies provider strings into
`day | month | season | year | unknown`:

- `YYYY-MM-DD` → day (validated as a real calendar day)
- `YYYY-MM` → month
- `Spring/Summer/Fall/Winter YYYY` → season, anchored to a bucket month
  (winter=01, spring=04, summer=07, fall/autumn=10) while preserving the
  authored label ("Fall 2026")
- `YYYY` → year
- `TBA`/`TBD`/`unknown`/`N/A` → unknown (excluded)

Seasons are grouped by their anchor bucket month (`2026-10`), headed by the
authored label. Partial buckets never claim a specific day.

## API

- `GET /api/v1/calendar?from&to&media&sources&limit` — `media`/`sources` are
  comma-separated domain/source ids; empty or omitted means "all". The window
  (`from`, `to`) is clamped to `CALENDAR_MAX_WINDOW_DAYS` (400).
- `GET /api/v1/calendar/preferences` / `PUT ...` — per-user preferences
  `{ view, domains, sources }` stored in `user_preferences.settings_json`
  under the `calendar` key.

`GET /api/v1/upcoming` (Home widget compatibility) still exists and returns
club events through `ctx.calendar.home(user)`.

## Preferences and URL state

- Server-persisted: view (`agenda`|`month`), domain selection, source selection,
  keyed to `CALENDAR_PREFERENCES_KEY`.
- URL state mirrors the same selections so a calendar state is shareable:
  `?view=month&media=books,movies,tv&sources=club&month=2026-09`.
- URL tokens are the **domain ids** (`book`, `audiobook`, ...) matched by the
  API. Month navigation (`month=YYYY-MM`) is URL-only, not persisted.

## Frontend

- Route: `/calendar` (`CalendarPage`), a sibling flat route after `activity`.
  Nav entry in `SECONDARY_NAV` in `src/web/app/shell.tsx`; icon registered in
  `src/web/components/icons/icon-registry.ts`.
- **Agenda view** (default) groups by concrete day with `formatDayHeader`; on
  the horizon, partial buckets (month/season/year) render as sections headed by
  their authored/derived label, marked "Date not finalized".
- **Month view** is a 7-column grid; only day-precision events render in cells
  (mini covers, `+N` opens a day detail Dialog). Partial releases never get a
  fabricated cell.
- `MediaPreviewPopover` (dependency-free) is anchored to each cover: hover or
  focus opens it, Escape / outside click / mouse-leave closes it, and the
  "Open" action navigates to the item.
- Filters are exposed as toggle chips ("All media" + six domains;
  "My calendar" + Library/Clubs). Empty selection means "all" for that
  dimension.

## Authorization

The endpoint requires `authenticated` user. Library providers project only
from the requesting user's own memberships; club events are limited to clubs
the user belongs to. File covers go through the file service's authorization.

## Critical invariants (tests)

- Deleting one representation must not delete unrelated representations; event
  derivation must tolerate a missing file.
- Source/domain filters must not be mixed into one filter dimension.
- Partial release dates must never surface as a concrete day.
- A failed metadata provider must not make the calendar unusable (provider
  failures are isolated).
- User calendar preferences must not be overwritten by another user's request.
- `/api/v1/upcoming` (Home) must keep functioning after the calendar
  refactor.