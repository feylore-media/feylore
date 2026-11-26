# Feylore — Deferred Scopes

**Last updated:** 2026-09-10

Per-pass and per-feature items deferred during implementation. Product-level V2 deferrals are in [V1-SCOPE.md §27–28](./V1-SCOPE.md#27-explicitly-not-v1). Pass sequencing is in [todo.md](./todo.md).

---


Pass 5
Recommendation engine / provider — slot only; no fake data
Continue watching — no movies/TV data; add a section component to the ordered list when the domain arrives
Formal section registry — defer until multiple conditionally enabled future-domain sections exist
Unified /favorites or /recent browse routes — use existing per-domain routes + search
Refactoring domain home pages beyond switching to shared ShelfRow (optional small cleanup)

Pass 6
Podcasts (Pass 7) — shares audio infra but separate domain
Home "Continue listening" widget (Pass 5) — Pass 6 provides view=continue list API; Home wires it later
EPUB Media Overlays / read-aloud (Books reader domain)
Cross-format position sync between book reading and audiobook listening (V1-SCOPE §22: future/optional)
Official Audible API credentials flow (AudNexus covers public metadata)

Pass 7
Progressive/streaming playback before full download
Standalone podcast sidebar module
library_content_type / podcast library containers
Show-level WEM shells
Per-user enclosure fetch jobs or duplicate managed files per user
Podcast-specific favorite/history API routes
Podcast Index / Apple Podcasts API providers
Episode queue / playlist beyond single-item play
Client-side offline audio cache in AudioEngine (download auth fix is in scope; client cache playback is follow-up)



Relationships (book ↔ audiobook) - Real (unenriched on books)
Enrich in routes like audiobooks do

Merged metadata (ISBN, publisher, date, language) -Partial — merged at ingest into metadata_records / manifestation externalId, not returned on detail
Add resolved metadata fields to detail response
EPUB technical facts
Partial — stored in file_technical_metadata via OPF extractor, no read API
Include per-file technical summary on detail
Custom metadata fields
Definitions and values — admin definitions under Formatting; values via entity custom-fields endpoints
Quotes -Not built

UI may show an interim count derived from annotations with highlightText only — display approximation, not a domain type; reserve Quotes tab for real quote entities later


Journal entries
Empty state + extension point; no fake entries

Universe
Component returns null until real data exists; no placeholder shell
Social reading (others' progress)
Not built — activity is own-user only

BookDetailSocialActivity returns null until real peer activity API exists — no fake infrastructure, no stub data, no empty section

KOReader / device name on progress

Show chapter + % + last updated when progress exists; omit device name until sync API exists; KOReader progress alone does not imply a Feylore reader target
Work visible without library membership
Not supported — ensureUserAccess gates detail
Out of scope; note for future social discovery
Replace file / remove representation
No public API

Curator menu shows scoped actions; only wire actions backed by real endpoints
Cross-format EPUB ↔ audiobook sync UI
Show related audiobook via relationships; no fake unified %


Pass 9 Movies
TMDB/IMDb live metadata or automatic external enrichment
TV, seasons, episodes
Transcoding, remuxing
Subtitle selection, audio-track selection
Sophisticated recommendation algorithms
A new offline-cache architecture
A second playback system

Pass 10 TV
TMDB/TVDB/IMDb/OMDb enrichment, scraping, external artwork providers
Transcoding/remuxing, subtitle/audio track picker
Skip intro/credits UI
Episode-level favorites or ratings
Standalone Live TV top-level nav domain
Full library-scan TV ingest processor (extension point only)
Playback architecture rewrite for HLS

Open Library Parser work
Audiobook/music tag write-back (requires a tag-writing library; music-metadata is read-only)
Calibre metadata.opf compatibility
Sidecar as ingest input (output-only in V1)
Cover image embedding into EPUB zip (can follow once bibliographic write is stable)
Deleting embedded.* descriptors from the registry (keep for internal ingest extraction; constrain eligibility only)
DB migration to drop import_source_order column (keep for now; stop exposing via API)



Physical book ownership (foundational pass)

Scope note: V1-SCOPE §28 lists "Mark media as owned" as a V2 candidate.
This pass implements only the minimal Books foundation — user-scoped
single-copy `physical_holdings` (Work + optional manifestation, null =
edition unknown), ownership service/API with idempotent ISBN resolution,
Files & Editions UI (Mark as owned / Identify edition / Remove ownership),
deletion-preview counts, and `physicalOwned` / `physicalWithoutDigital`
query support for future Shelf/Wishlist use. No dedicated physical-library
UI, pages, or cross-domain ownership.

Still deferred: multiple copies (future `physical_copies` layer referencing
the holding), condition/purchase/location/lending/signed-copy metadata,
digital ownership, barcode-scanner UI, Wishlist integration, dedicated
physical collection pages, non-Book domains (`work_type` is `'book'`-only),
and a delete-confirmation dialog consuming `GET /books/:slug/deletion-preview`.

Going forward: if you see EADDRINUSE on 3000, stop pnpm dev (Ctrl+C), clear the stale process, then restart:

netstat -ano | findstr ":3000"
taskkill /PID <pid> /F
pnpm dev