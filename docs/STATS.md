# Feylore Stats 1.0 (`Pass 16.1`)

Authoritative specification for the personal media statistics experience.

Scope: this document defines V1 behaviour for Stats only. Adjacent features
(playback-session telemetry beyond what exists today, genre vocabulary
rollups, reader page-range events, notification of completed backfills) are
explicitly Pass 2 and are called out where they matter.

---

## 1. Purpose

Stats is a per-user, date-bounded view over what that user has actually done
with their library: what they finished, what they rated, how they spent
observed reading time, and when the activity happened.

Stats is the **deliberate exception** to the V1-SCOPE §19 guidance that the
application should not include a decorative analytics dashboard. A personal
library benefits from an honest, personal, book-trade-style review of the year.
Every number in Stats must describe something real that happened. If a number
cannot be measured honestly, Stats does not show it, or shows it with a label
that says exactly what it measures.

Stats answers questions such as:

- How many books/movies/shows/albums/episodes/podcast episodes did I finish
  this year?
- What did my reading time look like, month by month?
- What did I rate, and how generous was I?
- Which creators, genres, and release decades did my reading/watching gravitate
  toward this year?
- What was the average runtime of the movies I finished?

Stats does **not** answer questions such as:

- How many total hours did I listen this year? (We do not yet record
  listening/watch time as observed time. Duration-based totals are labelled as
  what they are: "Xh of completed movie runtime".)
- Who are my most compatible friends? (Social compatibility is out of scope.)

---

## 2. Routes

| Route | Meaning |
| --- | --- |
| `/users/:username/stats` | Cross-media overview for the user. |
| `/users/:username/stats/books` | Per-domain page. |
| `/users/:username/stats/audiobooks` | Per-domain page. |
| `/users/:username/stats/podcasts` | Per-domain page. |
| `/users/:username/stats/music` | Per-domain page. |
| `/users/:username/stats/movies` | Per-domain page. |
| `/users/:username/stats/tv` | Per-domain page. |
| `/users/:username/stats/ttrpg` | Per-domain page. |
| `/stats` | Redirects to `/users/{currentUser}/stats` for the signed-in user. |

The main navigation `Stats` item links to `/stats`.

Domain routes live under the profile URL because Stats belongs to a person, not
to the app.

### 2.1 Query state

Every selection in the date picker resolves to canonical `from`/`to` ISO date
values (`YYYY-MM-DD`, inclusive, UTC). There is no client-side "year mode" or
"month mode" — the URL is always `from`/`to`.

- Absent `from`/`to` → the current calendar year, which is canonicalized back
  into the URL (the page replaces the URL with `?from=YYYY-01-01&to=YYYY-12-31`).
- `All time` is represented as `from=1970-01-01`, `to` absent.
- `to` never appears without `from`.
- Server re-validates both values; out-of-order or malformed values fall back
  to the default range.
- Media tabs preserve `from`/`to`: switching domain never discards the date
  selection.

### 2.2 Masthead

The page heading is itself the date picker. The masthead is:

```
{DisplayName}'s {RangeLabel}   [▾]
     [in {Domain}]              (optional suffix)
```

The whole heading is a button that opens the Date picker popover. There is no
separate "year" button and no date-range button outside the heading.

Range labels (produced by `formatStatsRangeLabel` in `src/shared/stats.ts`):

| Selection | Label |
| --- | --- |
| Full year | `2026` |
| One month | `Sep '26` |
| Custom, same year | `Jun 15 – Sep 20 '26` |
| Custom, cross-year | `Dec '25 – Feb '26` |
| All time | `All Time` |

Picker controls:

- Quick presets: This month, This year, Last month, Last year, All time.
- Month/year navigation (◂ year ▸ | ◂ month ▸) that selects a single month.
- Custom date range: two date inputs with From/To.
- Apply and Clear (-> current year).

---

## 3. Fact store

All Stats data is derived from an append-oriented, user-scoped fact table,
`user_stat_facts`. Facts are written by domain services when real, measurable
events happen. Facts are never computed lazily from live library state at page
render time, because the live state does not always survive deletions
(reading history currently cascade-deletes with representations, for example).

### 3.1 Fact semantics

A fact column definition, from `src/server/db/schema.ts`:

| Column | Meaning |
| --- | --- |
| `user_id` | Owner. FK cascade — deleting a user deletes their facts. |
| `kind` | `completed` \| `rated` \| `progress` \| `session` \| `play` \| `page_read`. A measurable event, not a modality. The domain lives in `media_type`. |
| `media_type` | `books` \| `audiobooks` \| `podcasts` \| `music` \| `movies` \| `tv` \| `ttrpg`. |
| `subject_type` / `subject_id` | Opaque subject identifier (e.g. `book`/id, `album`/id, `movie`/id). No filesystem paths. |
| `occurred_at` | When the event happened (timestamptz). |
| `value` / `unit` | What was measured. Units: `count`, `stars`, `seconds`, `pages`, `plays`. |
| `rating_scale` | `5` or `10`, captured at event time. |
| `snapshot` | Immutable display context: title, subtitle, creators by role, genres, release year, pages, durations, cover file id. Allows history to survive deletion of the subject. |
| `visibility` | `private` \| `public`. Default `private`. Decides who else may include this fact in aggregate views. |
| `source` / `source_key` | Provenance + idempotency. `(user_id, kind, source, source_key)` is unique. |

Kinds granted to V1:

- `completed` — user finished something (book, audiobook, movie, show/season,
  episode, album, podcast episode).
- `rated` — current rating state for a subject. `occurred_at` is the first
  rating date (V1 rating table has no re-rate date; documented in §7.2).
- `session` — a bounded, recorded reading session (real observed time, seconds).
- `play` — a playback start (movie, TV episode, track, audiobook chapter,
  podcast episode). Provides play counts. Pass 2 extends the playback data to
  derive observed listening/watching time.

Reserved for later passes (taxonomy exists now, no V1 writers):

- `progress` — a documented position checkpoint.
- `page_read` — a read page for an EPUB (only if genuinely useful as an event).

### 3.2 What counts as observed time

Observed time is only recorded when Feylore itself has measured elapsed,
active consumption time. In V1 the only source is reading sessions
(`reading_activity` rows).

- Reading time: sum of validated reading-session seconds. Real observed time;
  surfaced as "Reading time".
- Listening/watch time: **not manufactured.** Media `durationSeconds` is runtime
  metadata, not observed time. Duration-derived numbers may be shown only with
  labels that describe them: "Average runtime 1h 54m", "89h of completed movie
  runtime", "37h of completed audiobook runtime" — never "89h watched" or
  "89h listened".
- Pass 2 adds playback-session facts that record actual active playback
  intervals; only then do listening/watch time charts exist.

### 3.3 Snapshot content

`snapshot` jsonb, versioned under `snapshotVersion: 1`:

```jsonc
{
  "snapshotVersion": 1,
  "title": "The Name of the Wind",
  "subtitle": "The Kingkiller Chronicle #1",
  "href": "/books/:slug",            // or /audiobooks/:id, /movies/:slug, etc.
  "creators": [{ "role": "author", "name": "Patrick Rothfuss", "peopleId": "..." }],
  "genres": [{ "name": "Fantasy", "termId": null }],
  "releaseYear": 2007,
  "pages": 662,                      // when the domain records pages
  "durationSeconds": 271200,         // runtime metadata only
  "coverFileId": "..."               // for live cover lookup
}
```

`genres[].termId` is populated when the name resolves to a known
`metadata_vocabulary` term; hierarchy rollups are Pass 2.

---

## 4. Privacy

- An owner always sees all of their facts.
- A viewer sees a fact only if `visibility = 'public'` (V1; conservative
  default — more levels arrive with the privacy system).
- The visibility predicate is applied in SQL **before** any aggregation. A
  viewer must never be able to infer the existence of private items from an
  aggregate (e.g. a total of "1 book" when the only qualifying book is from a
  private activity), so facts are filtered at the row level first.
- The profile-visibility gate is reused: a viewer who cannot view the profile
  at all gets the same response they would receive for an inaccessible profile
  (404 semantics), before any stats shape is produced.
- Privacy-leak tests are mandatory (§9).

---

## 5. API

`GET /api/v1/profiles/:username/stats`
`GET /api/v1/profiles/:username/stats/:domain`

Query: `from`, `to` (optional ISO dates; §2.1 semantics apply server-side).

Response (both routes; `media_type` pins a subset for the domain route):

```ts
interface StatsResponse {
  profile: { username: string; displayName: string };
  range: { from: string | null; to: string | null; label: string };
  headline: {
    domainCounts: { mediaType: StatsMediaType; count: number }[];
    totalCompleted: number;
    activeDays: number;
    readingSeconds: number;          // observed reading time in range
  };
  media: { mediaType: StatsMediaType; label: string }[];   // tabs with data
  timeSeries: {
    ticks: { key: string; label: string }[];
    buckets: { key: string; completed: number; sessions: number; plays: number; readingSeconds: number }[];
  };
  rating: {
    bucketSize: 5 | 10;
    avg: number | null;
    count: number;
    distribution: { value: number; count: number }[];
  };
  genres: { name: string; count: number; share: number }[];
  creators: { role: string; name: string; peopleId?: string; count: number }[];
  releaseYears: { year: number; count: number }[];
  duration: {
    completedCount: number;
    avgSeconds: number | null;
    totalSeconds: number | null;    // runtime total, labelled as runtime
  } | null;                          // domains with no duration metadata -> null
  highlights: (Highlight & { coverFileId?: string })[];  // highest-rated in range
  heatmap: { day: string; count: number }[]; // activity density, most recent year
}
```

The aggregate shapes are computed server-side from the pre-filtered fact set.
The response is intentionally aggregated detail; facts themselves are not
exposed through this API.

Tabs with data (`media`) come from the filtered fact set, but the UI always
renders all tab slots (§7.3).

---

## 6. Presentation

### 6.1 Overview page (`/users/:username/stats`)

Sections, in order:

1. **Headline** — compact stat row: total finished, domains finished
   (`n Books · n Movies · n Shows…`), days active, and reading time when > 0.
2. **Activity / time series** — month-granularity bars of completions, plays,
   and reading seconds (reading only where observed time exists).
3. **Ratings** — distribution of ratings in range + average, honoring the user's
   configured rating scale (from the scale captured on each fact).
4. **Genres** — top genres across completed items in range.
5. **Creators** — top creators by role, across completed items in range.
6. **Release years** — histogram of completed items by release year.
7. **Highlights** — the highest-rated items in range (cover + title + rating).
8. **Heatmap** — activity density per day for the range's most recent 12 months.

Section absence: a section with no data is omitted entirely rather than
rendered empty; the one exception is a fully empty profile, which shows one
good overall empty state pointing to where activity is created.

### 6.2 Domain page

Same skeleton, media-filtered. Replaces domainCounts with the domain's own
unit (e.g. "Book finished"), and adds the runtime block when the domain records
durations ("Average runtime" / "Total completed runtime"), always labelled as
runtime. A domain with no facts shows a per-domain empty state; the tab still
renders.

### 6.3 Tabs and module enablement

All standard tab slots render for every user at every date range, regardless of
which media modules are enabled. Historical data determines what a tab can
show, not whether the tab exists. Disabling a module never hides a user's
history per §3, and a tab whose domain has no data gets a proper empty state.

### 6.4 Charts

Hand-rolled SVG components only (no chart dependency). Consistent with the
design system: quiet grids, `--color-accent` used sparely, data-first titles
instead of decorations, reduced-motion respected, tabular numerals for axes.
Month/heat labels never rely on color alone.

---

## 7. Semantics and data rules

### 7.1 Lineage and idempotency

Facts survive:

- deleting a representation (snapshot + id) — never delete facts on
  representation removal.
- deleting a file — same.
- disabling a media module — same.
- deleting a user — facts go with the user (FK cascade).

Production writes go through the `StatsFactRecorder` which uses unique
`(user_id, kind, source, source_key)` to make writes idempotent. The backfill
job re-emits historical facts with the same keys and can be run repeatedly.

### 7.2 Ratings

- `rated` facts reflect the *current* rating for a subject. `occurred_at`
  preserves the first rating date; rating tables in V1 do not record re-rate
  dates, so the distribution and "Highest rated" evaluate current ratings and
  the earliest date we have.
- Clearing a rating removes that subject's `rated` fact.
- Value/scale come from the rating at event time (always 1–5 in V1; reviews
  are not part of Stats).

### 7.3 Visibility defaults

Facts default to `visibility = 'private'`. There is no V1 UI to publish facts;
the column exists so the privacy boundary is real and testable. The owner-only
path is the default experience today.

### 7.4 Genre names

Snapshot genre names are as-written at event time but normalized through the
metadata formatting/`resolveGenres` path where available, and `termId` is
attached when a matching vocabulary term exists. Complete term hierarchy
rollups are Pass 2.

---

## 8. Background work

`stats.backfill` job, per user or all users:

1. Reading completions (`reading_progress.completedAt`) → `completed`.
2. Activity events (`book.reading_finished`, `listening.finished`) → `completed`.
3. Playback starts (`listening.started`, plus playback service transitions) → `play`.
4. Reading sessions (`reading_activity`) → `session` (real seconds).
5. Ratings (`user_ratings`) → `rated`.

The job is idempotent via §7.1 keys and records its own job run (write-side
job rows). V1 wiring triggers backfill when the job is enqueued; automatic
trigger-on-scan is Pass 2.

---

## 9. Testing requirements

- **Privacy**: a viewer's aggregates never include private facts (SQL-level
  filter-first assertion). Register with an account whose activities are
  private → other accounts see none of the derived numbers.
- **Idempotency**: re-running the backfill (or re-recording an event) does not
  double-count. Completed/plays/sessions key on stable event identity.
- **Writers**: rating upsert survives re-rate; clearing rating removes the fact;
  deleting a representation does not remove completion facts.
- **Range handling**: default = current calendar year; `formatStatsRangeLabel`
  covers every label case in §2.2 (now/anchor-date fixed in tests).
- **Aggregation correctness**: counts, averages, distributions, and the runtime
  block for a seeded fixture.
- **Auth**: unauthenticated request → 401; inaccessible profile → 404.
- **Scale**: rating buckets follow the fact's `rating_scale`.

---

## 10. Recorded decisions

| Decision | Where recorded |
| --- | --- |
| Stats is the intended exception to the "no analytics dashboard" guidance. | V1-SCOPE §19 (this doc supersedes for Stats). |
| Podcasts have their own Stats tab (exception to "podcasts belong under audiobooks/audio" sidebar grouping). | This doc §2. |
| Duration is runtime, never observed time. | §3.2, and in the UI labels. |
| `stats.backfill` is a V1 admin/operator job. | §8. |
| DESIGN-SYSTEM §22 text is amended; data-viz colour tokens added. | DESIGN-SYSTEM.md. |