# Feylore Media Model (Foundation)

## Core distinctions

Feylore separates concerns that other systems often conflate:

| Concept                | What it is                                                                                                                                      | What it is not                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Library membership** | Feylore's association between a user's library and a bibliographic entity or representation                                                     | A file; the bibliographic Work itself        |
| **Representation**     | Application-level digital access representation; optionally associated with a Manifestation; may contain one or more Files                      | A Work, Expression, or Manifestation         |
| **File**               | A discovered filesystem object associated with a representation                                                                                 | A library membership or bibliographic entity |
| **Metadata**           | Descriptive information about content                                                                                                           | User state                                   |
| **User state**         | Ratings, favorites, progress, downloads, history                                                                                                | Metadata                                     |

**Representation is not a fourth WEM level.** It is a Feylore application/storage abstraction used to connect bibliographic identity with accessible digital resources.

## Bibliographic identity

Feylore's library-management model is distinct from the canonical bibliographic **Work → Expression → Manifestation** model.

The bibliographic model establishes identity and relationships:

```text
Work
└── Expression (associated with Work)
    └── Manifestation (associated with Expression)
        └── Representation (Feylore application layer — not WEM)
            └── File(s)
```

Feylore does not replace Work → Expression → Manifestation with its own identity model. Representation is an application/storage abstraction used to connect bibliographic identity with accessible digital resources.

## Media identity and public slugs

Work entities (Books and future media domains) have two identifiers in separate namespaces:

```text
id          — immutable 6-character internal identity
slug        — persisted public routing identifier (unique per domain table)
slugStatus  — pending | canonical
```

During import before metadata resolution, `slug = id` and `slugStatus = pending`. After metadata provides a canonical title, the slug is assigned once (`slugStatus = canonical`) and is not automatically regenerated when the title changes later.

Public HTTP routes and frontend URLs use `:slug`. The API resolves public references with `WHERE slug = $ref`. Pending entities are reachable at `/books/a7k3p9` until promoted to `/books/the-lightning-thief`.

Infrastructure entities (users, files, representations, WEM rows, jobs, shelves) remain UUID-based internally. Public user profiles are reached at `/u/:username`, resolving the persisted `users.username` handle (not a separate media-style slug).

## Terminology note

Admin **`libraries`** (in storage configuration) group storage locations for scanning and management. **Library membership** is a separate concept: a user's association with a bibliographic Work (or, when intentional, an Expression, Manifestation, or Representation). Do not conflate storage containers with collection membership.

## Files are not library entities

A file is a digital resource the application can access. Files are discovered through storage scans and referenced by opaque IDs. The filesystem path is an implementation detail never exposed through the public API.

## No universal "primary file"

A representation may have multiple files, and a work may have multiple representations. There is **no `is_primary` flag**. Deleting one file or representation must not invalidate unrelated representations, bibliographic identity, or user state.

```text
Book (Work)
├── Representation (EPUB) → file(s)
├── Representation (PDF) → file(s)
└── Representation (CBZ) → file(s)

Audiobook (related Work, separate domain)
└── Representation → audio file(s)
```

Deleting an EPUB must not delete a related audiobook. Deleting a PDF must not delete unrelated metadata.

## Creative identity (People)

Creative entities (authors, narrators, artists, directors, actors, and similar identifiable humans, groups, and organizations) are a shared canonical identity layer, **not** per-domain associations.

| Concern | Layer | Storage |
| ------- | ----- | ------- |
| Canonical identity (`person` \| `group` \| `organization`) | **Creative identity graph** | `people` (immutable 6-char `id`, mutable `slug`, `entityType`, `name`, `sortName`, bio, pronouns, photo) |
| Media credits (author, narrator, actor, director, artist, …) | **Credit relationships** | `person_credits` (`peopleId`, polymorphic `targetType`/`targetId`, `role`, `character`, `sortOrder`). `targetId` is `NOT NULL` and always points at a library entity; the unique index covers `(peopleId, targetType, targetId, role)` |
| Provider identity | **Identity** | `person_provider_identifiers` (`provider` + `identifier`, e.g. Wikidata QID, MusicBrainz MBID) |
| Entity ↔ entity links (membership, association, founding) | **Relationships** | `person_relationships` (directed, presented bidirectionally) |

Invariants:

- One identifiable creative entity → **one canonical** `people` row. Domain associations may keep their own tables (e.g. `audiobook_narrators`) but resolve to the canonical entity via a `peopleId` foreign key where the domain supports it.
- `person_credits` are media credits only. `member` is not a credit role — group membership lives in `person_relationships`.
- Provider identity resolution (explicit entity ref → provider identifier → normalized name → create) uses **opaque deterministic matching**; slugs are mutable and never used for identity resolution.
- Deleting a representation or domain association never deletes the canonical entity; deleting an entity cascades only its own credits/identifiers/relationships.

Write paths: setting book authors, audiobook authors/narrators, music album artists, or book contributors resolves each name into a canonical `people` entity (case-insensitive, never duplicating) and synchronizes the target's `person_credits` for that role. Domain association rows (`book_authors`, `audiobook_authors`, `audiobook_narrators`, `music_artists`) store the resolved `peopleId`; `person_credits` deletes with the role-set on replacement. Backfill: `src/server/db/backfill-people.ts` links existing associations and writes idempotent credits.

Discovery is media-contextual (Books → Authors, Music → Artists, Movies → Cast & Crew) with a single canonical profile at `/people/:slug`. There is no top-level People navigation item.

### Person metadata editing

People editing reuses the shared metadata surface (field overrides as locks, provenance rows, provider records, evidence-only fetch jobs) rather than building a parallel metadata model:

- Canonical person fields live on the `people` row (name, sortName, alternateNames array, bio, pronouns, personalUrl, birth/death `date`, birth/death `place`, photo → `photoFileId`). Field keys come from the shared canonical field registry tagged `mediaModules: ["people"]`, so the matrix editor components are shared with Books via a `kindOf` field-kind resolver.
- `field_overrides` (subject `person`) act as per-field locks; `metadata_field_provenance` records origin (`edit`/`adopt`) and source for every written field.
- Portrait is managed through a dedicated photo endpoint (download → managed storage → `photoFileId`). Direct field writes to `photo` are rejected.
- Fetching to person is **evidence-only**: `metadata_records` for `person` subjects are never merged automatically. `PersonCanonicalService.setPersonField`/`setPersonFieldsFromEdit` writes only what a user (or an explicit adopt) requests.
- The first provider is Wikidata (`wikidata`, media module `people`), registered in the standard provider registry and auto-enabled; it maps schema.org/entity properties to the canonical person payload (bio, birth/death dates and places, photo via Wikimedia Commons, alternate names, personal URL, occupations/nationality labels, Wikipedia link, QID identifier).
- Person links (`personLinks`) and provider identifiers (`person_provider_identifiers`) are directly user-managed. Duplicate candidates are surfaced by name/sort-name matching and resolved via a directional merge (`mergePersonInto`) that moves credits, links, identifiers, metadata records, and provenance while skipping conflicts and then deletes the source row.

## Audiobooks (Pass 6)

Audiobooks are a **separate Work domain** from Books. An audiobook may be related to a book via `creative_work_relationships` (`related_edition`) without shared deletion.

| Concern | Layer | Storage |
| ------- | ----- | ------- |
| Title, subtitle, description | **Work** | `audiobooks` |
| Authors, narrators, series, genres | **Work** | `audiobook_*` association tables |
| ASIN and release identifiers | **Manifestation** | `creative_work_manifestations.externalIdType` / `externalId` (e.g. `asin`) |
| Per-file duration, codec | **Technical metadata** | `fileTechnicalMetadata.payload` |
| Aggregated runtime for display | **Derived at read time** | Sum of linked file durations on representation detail — **not** stored on Work |
| Narrator identity | **Creative identity** | Resolves to a canonical `people` entity via `peopleId` on the audiobook narrator association (see [Creative identity](#creative-identity-people)) |

Multi-file audiobooks link ordered tracks via `representation_files.sortOrder` (disc → track → filename at ingest).

## Podcasts (Pass 7)

Podcasts are a **separate domain** from audiobooks. Episodes are not audiobook Works.

| Concern | Layer | Storage |
| ------- | ----- | ------- |
| Show title, description, author | **Show** | `podcast_shows` (no show-level WEM shell) |
| Feed URL, sync state | **Feed** | `podcast_feeds` |
| Episode metadata, enclosure URL | **Episode** | `podcast_episodes` (`UNIQUE (show_id, guid)`) |
| Per-user follow | **Subscription** | `podcast_subscriptions` (not `library_memberships`) |
| Playable audio | **Representation** | Episode-level WEM chain created at prepare time; `domain_module = podcasts` |
| Progress / history | **User state** | `subjectType = podcast_episode` via shared `/playback/*` APIs |

Feed sync runs **once per feed** (not per subscriber). Enclosure preparation is **download-then-play**: shared managed file, deduplicated per episode.

## Movies (Pass 9)

Movies are a **flat Work domain** (no show/season/episode hierarchy). TV (Pass 10) is separate.

| Concern | Layer | Storage |
| ------- | ----- | ------- |
| Title, description, release date, runtime, studio, rating | **Movie Work** | `movies` |
| Genres | **Movie association** | `movie_genres` |
| Cast/crew | **People + credits** | `movie_people`, `movie_credits` (roles: director, actor, writer, etc.) |
| Franchise/collection grouping | **Collection** | `movie_collections`, `movie_collection_items` |
| Playable video | **Representation** | WEM chain with `workType = movie`, `domain_module = movies` |
| Progress / history / favorites / ratings | **User state** | `subjectType = movie` via shared `/playback/*` APIs and user-state tables |
| Search | **Search index** | `entityType = movie` |

Metadata in V1 comes from embedded video tags, filename heuristics (`Title (Year)`), and manual edits. External provider IDs belong on manifestations; IMDb/TMDB providers remain stubs.

Video playback uses shared `VideoEngine` (`PlaybackContext → VideoEngine → <video>`). Browser baseline: H.264/AAC in MP4 with HTTP range-request streaming.

## TV (Pass 10)

TV is a **hierarchical library domain** distinct from flat Movies.

| Concern | Layer | Storage / subject |
| ------- | ----- | ----------------- |
| Show identity, membership, favorite, rating | **Show Work** | `tv_shows`; `subjectType = show` |
| Season organization | **Season** | `tv_seasons` (not a subject type) |
| Playable episode | **Episode** | `tv_episodes`; progress/history on `subjectType = tv_episode` |
| Genres, cast/crew | **Associations** | `tv_genres`, `tv_people`, `tv_credits` |
| Playable video | **Representation** | Per-episode WEM; `domain_module = tv`, `workType = tv_episode` |

**Routing:** show slug only (`/tv/shows/:slug`); seasons and episodes use numeric `:season` and `:episode` in URLs.

**Season 0** is reserved for Specials. Episode ordering uses `seasonNumber`, `episodeNumber`, then `sortOrder`.

**Live TV** (`live_tv_playlists`, `live_tv_channels`, optional `live_tv_programs`) is separate from library TV: no library membership, progress, or continue-watching. Playback uses `subjectType = live_tv_channel` with `sessionMode: persistent`. Playlist source URLs are sensitive configuration and are not exposed to clients.

Artwork fallback: episode → season → show → placeholder.

Metadata in V1: embedded tags, filename/path heuristics, and manual edits only (no TMDB/TVDB enrichment).

## Scan and association lifecycle

- **Library scans** discover Files in configured library storage (in-place indexing)
- **Ingest** moves or copies new files from ingest roots or upload staging through the pipeline into a library destination
- **Association jobs** connect Files to Representations
- **Metadata resolution** establishes/enriches WEM identity
- **Scans must not directly create Works**
- **Library scans must not create `ingest_items`**

Library scan and ingest are distinct operations with distinct APIs and UI.

## Libraries, ingest roots, and upload

| Concept | Role |
| ------- | ---- |
| **Library** | Persistent destination: storage location + content type + organization/normalization policies |
| **Ingest root** | Watched incoming filesystem tree (may be nested) |
| **Upload** | Browser transport into staging; creates the same `ingest_items` records as filesystem ingest |
| **`ingest_items`** | Durable ingestion state (Activity UI, recovery, retry) |
| **`ingest.process`** | pg-boss execution only; status lives on `ingest_items` |

### Organization policies

- **Managed** — after ingest, files are organized under the library storage root using domain templates (Books V1)
- **In place** — files remain where discovered; library scan indexes them without moving

External/read-only storage is discovered in place without reorganization. Managed libraries may copy from ingest, verify, commit, then retire the source file.

## Metadata layers

Feylore separates **evidence** from **canonical state**:

1. **Imported information** — file-derived evidence (EPUB/OPF, filename heuristics, embedded tags). Re-extracted when files change; not external authorities.
2. **Metadata providers** — externally refreshed evidence (Open Library, Hardcover, etc.). Queried/refreshed on demand.
3. **Feylore canonical** — normalized domain entity fields with persisted per-field provenance.
4. **Provenance** — explains the current canonical value (`metadata_field_provenance`). Updated only when the canonical value changes.
5. **User overrides** — lock protection (`field_overrides`). Metadata merge/refresh **skips** overridden fields.

Provenance and override are independent: a field may be sourced from Hardcover without being locked, and a locked field retains its provenance until the canonical value changes.

All metadata-editor mutations must pass through `MetadataCanonicalService`; direct writes to canonical metadata tables for editor fields are prohibited.

External provider ratings are not user ratings. Metadata refresh must not overwrite user state.

## User state

Separate tables/concerns for:

- Favorites
- Ratings
- Progress (representation-independent where semantically possible; representation-specific locators may be required for different media types)
- History
- Downloads (local cache, not ownership)

## Storage vs identity

`file.id` identifies a discovered object within Feylore. Checksum aids deduplication but is **not** file identity. Two identical files in two locations are two files.

## Read-only and external storage

Storage locations may be managed, external, or read-only. Read-only locations cannot be modified.

- **External / in-place libraries** — files stay where they are; library scan discovers and indexes them
- **Managed libraries** — ingest may copy and organize files into the library storage root

Do not conflate “external storage” with “no organization policy.” Libraries declare whether content is managed or indexed in place.

## Schema.org anchor

Domain modeling begins from applicable `schema.org/CreativeWork` types. Feylore-specific concepts apply only for library-management state, application behavior, storage, user state, and permissions.

The library-management model remains **distinct** from bibliographic Work → Expression → Manifestation aggregation. The aggregation layer establishes canonical bibliographic identity; Feylore adds library membership, storage, and user-state concerns around that identity.

## Shelves and universes

- **Shelves:** cross-domain user collections. Basic (explicit) or Advanced (rule-based). Not a Books feature.
- **Universes:** cross-domain view over related works. Presentation/relationship concept, not a container replacing domain types.

## Downloads

A download is a user/device-local cache of a file. It is not ownership of the file and not a separate library representation. Removing a download removes the local copy only.

## Foundation scope

Foundation establishes these contracts and platform tables. Domain entities (Book, Album, Show, etc.) are implemented in subsequent module passes.
