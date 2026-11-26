# Reading Progress

Feylore is the canonical reading progress server. Clients sync representation-scoped progress, activity, and sessions through platform APIs — they do not own authoritative state independently.

## Layers

| Layer | Table | Purpose |
|-------|-------|---------|
| Progress | `reading_progress` | Current resume position per user + representation |
| Events | `reading_progress_events` | Accepted progress transitions (audit/history) |
| Activity | `reading_activity` | Atomic telemetry periods (duration + locator snapshot) |
| Sessions | `reading_sessions` | Grouped, qualified reading periods derived from activity |

Progress sync is **independent** of session qualification. A 30-second peek can update progress and record activity without producing a qualified session.

## Canonical positioning

**Readium Locator** (`ReadingLocator` in `src/shared/reading-progress.ts`) is the canonical positioning model. The server stores the richest locator available (href, CFI, progression, position, text context, display page fields).

Adapters map client formats at boundaries:

- **Readium adapter** (web reader): Readium `Locator` ↔ `ReadingLocator`
- **KOReader adapter** (Phase 2): KOSync / `statistics.sqlite3` ↔ Feylore progress/activity/session

Server code must not import Readium types. KOReader page/XPath/percentage fields must not shape the domain schema.

## Work-level display

Work-level “continue reading” is **derived** via `getPrimaryProgressForWork()` — the most recently updated non-completed representation progress. Feylore does not store a separate work-level progress row.

## Session qualification

- `READING_SESSION_QUALIFICATION_SECONDS` (default 300): active duration required to qualify a session
- `READING_SESSION_INACTIVITY_SECONDS` (default 120): gap that ends the current session
- `READING_SESSION_MAX_ACTIVE_BURST_SECONDS` (default 60): cap per activity record

Activity `duration` is untrusted client input. The server validates, caps, and rejects accumulation while the document is not visible (`visibility !== "active"`).

## Sync preference

`user_preferences.progress_sync_enabled` gates progress PUT and activity/session recording. When disabled, mutating endpoints return 403.

## KOReader comparison

KOReader's `page_stat_data` demonstrates the value of retaining primitive, timestamped duration observations and deriving higher-level statistics from them. Feylore adopts that principle while using representation-scoped `ReadingLocator` snapshots (Readium Locator model) rather than page-centric coordinates. `reading_activity` is the canonical activity primitive; `reading_sessions` are deterministic groupings; statistics are derived from both. KOReader's KOSync and `statistics.sqlite3` formats are mapped into this model via adapters — they do not define Feylore's internal schema.

## Phase 2 (deferred)

- Full KOSync server + KOReader Lua plugin
- Reading statistics UI, charts, history views
- External progress integrations (Hardcover, etc.)
- Optional cached aggregate counter tables
