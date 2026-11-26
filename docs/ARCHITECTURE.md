# Feylore Architecture

## Overview

Feylore is a self-hosted personal library and media application. The Foundation pass establishes platform infrastructure only; media domains (Books, Music, TV, etc.) are implemented in separate passes.

## Selected stack (August 2026)

| Concern            | Choice                                                            |
| ------------------ | ----------------------------------------------------------------- |
| Language / runtime | TypeScript + Node.js 24 LTS                                       |
| API                | Fastify 5                                                         |
| Web / PWA          | Vite 8 + React 19.2 + React Router 8                              |
| Styling            | CSS custom properties + CSS Modules + Radix                       |
| Database           | PostgreSQL 16                                                     |
| ORM / migrations   | Drizzle ORM                                                       |
| Validation         | Zod                                                               |
| Auth               | PostgreSQL sessions + Argon2id (opaque token, hashed server-side) |
| Jobs               | pg-boss                                                           |
| Search             | PostgreSQL FTS behind `SearchIndex` interface                     |
| i18n               | i18next                                                           |
| PWA                | vite-plugin-pwa / Workbox                                         |
| Testing            | Vitest + Fastify inject + real PostgreSQL                         |

**Versioning principle:** current stable majors + LTS runtime. Do not chase every patch on every dependency.

**Rejected:** Next.js (weaker self-hosted streaming/worker fit), SQLite (concurrency), Prisma (extra engine), Redis/BullMQ (operational overhead), Meilisearch/ES (extra service for V1), generic `media_items` table (contradicts domain distinctness).

## Production topology

```
postgres ──┬── app (API + static SPA)
           └── worker (pg-boss jobs)
```

Migrations run as an **explicit step** (`pnpm db:migrate`) before app/worker startup. Application startup does **not** silently mutate schema.

## Module boundaries

```
Platform
├── Authentication, Users, Roles & Permissions
├── Configuration, Libraries (admin containers)
├── Storage, Files
├── Metadata contracts + registry + provenance
├── Jobs, Search, Downloads, Activity, Audit
├── Integrations (outbound HTTP, adapter slots)
└── Recommendation slot (deferred)

Media Domains (later)
├── Books, Audiobooks, Music, Movies, TV, Photos, TTRPG

Metadata Providers (outside core)
└── Independently versioned; registered via contract
```

**Single-package rule:** `src/server/modules/*` are bounded modules inside one deployable package. Metadata providers live in `src/providers/` and may become separate packages later.

## Carried-forward product contracts

See also [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md).

### Cross-domain

- **Shelves:** cross-domain collection model with scope (`global` or domain), icon, visibility (`private` / `shared` / `collaborative`), manual + rule membership (`membership_expression`), multi-level `sort_levels`, and `shelf_excluded_items` for rule-only removals. `shelf.publish` required for shared/collaborative shelves.
- **Rule engine:** shared predicate/expression engine for dynamic Shelves, Goals, Challenges, and future smart collections. The engine should evaluate boolean rule trees (`and` / `or` groups + typed predicates), support a domain-aware field/operator registry, and keep unknown metadata values explicit rather than inferred.
- **Goals:** a general cross-domain tracking primitive, not a set of media-specific goal implementations. Goals should model target + metric + activity + period + eligibility rules, with domain-aware metrics, aggregated distinct counting, and shared templates for annual reading, TBR, genre, creator, around-the-world, screen, listening, and custom goals.
- **Achievements:** feature-owned earned accomplishments (`achievement_definitions` + `user_achievements`) behind an `AchievementService` boundary. Definitions and grants are source-scoped (goal, challenge, club, system) with idempotent granting, immutable grant snapshots, source-visibility-filtered reads, and a canonical `achievement.earned` event. See [ACHIEVEMENTS.md](./ACHIEVEMENTS.md).
- **Cross-media curation and landing pages:** Shelves own curated groupings. Future showcase presentation may add hero artwork, description, layout, and theme controls. Series owns ordered membership; factual Work relationships remain independent of Shelf membership. A separate Universe/Franchise entity requires a demonstrated use case.
- User state (ratings, favorites, progress, downloads) is distinct from metadata.

### Roles

Default: Admin, Curator, Member, Kid. Multi-role capable. Authorization is **always permission-based** (`can(user, permission, resource)`). Never role-name checks in feature code. Admin UI may warn on Kid+Admin combination but does not block or special-case it.

### Home

- Empty: welcome/onboarding, no KPI widgets.
- Populated (later): modular activity/recommendation widgets when data exists.
- `RecommendationProvider` interface deferred.

### Search limitation

- **Entity search:** in scope (Postgres FTS via `SearchIndex`).
- **In-publication full-text search** (EPUB/PDF body text): unresolved in V1-SCOPE §26; **intentionally excluded** from Foundation.

## Data ownership

- **Bibliographic identity (WEM):** Work → Expression → Manifestation establishes canonical identity. Domain Work tables (`books`, etc.) hold Work-level fields; `creative_work_expressions` and `creative_work_manifestations` hold shared WEM structure. Expressions are associated with Works; Manifestations are associated with Expressions.
- **Representation:** application-level digital access; optionally associated with a Manifestation; contains Files via M:N `representation_files`. Not a WEM level.
- **Library membership:** user association with a Work (normally), or Expression/Manifestation/Representation when intentionally collecting at that level. Distinct from admin `libraries` storage containers.
- **Files:** discovered filesystem objects; `file.id` is identity; checksum is deduplication info, not identity. Linked only to Representations.
- **Metadata:** source records (provider-attributed) → normalized domain metadata → user field overrides (refresh skips).
- **User state:** ratings, favorites, progress, history — separate from metadata; typically attached to Works.
- **Downloads:** user/device-local cache of a file; not ownership; not a representation.
- **Activity:** user-facing library events. **Audit:** admin/security events. Different retention and privacy.

## Storage architecture

All filesystem access goes through `StorageService` adapters:

- `managed` — app may write/move/delete when authorized
- `external` — discover in place; no reorganization
- `read_only` — read/stream only

Path containment uses a two-layer model:

- **Lexical** (`normalizeRelativePath`, `normalizeZipEntryPath`) — synchronous string validation for relative paths and zip/archive entry names. Rejects `..` segments, absolute paths, and null bytes. No filesystem I/O; no symlink awareness. Use for EPUB `?path=` query parameters, `container.xml` rootfile paths, and in-memory `JSZip.file()` lookups.
- **Filesystem** (`resolveSafePath`, `StorageAdapter.resolve()`) — authoritative check before any host filesystem read/write/stream/stat. Resolves under the configured root and verifies containment via `fs.realpath()` to detect symlink escapes.

`isPathContainedInRoot()` is a lexical pre-filter for already-absolute paths (e.g. ingest watcher). It does not replace `resolveSafePath()`.

File IDs are opaque; the API never returns absolute storage paths.

### Scan lifecycle (library scan — not ingestion)

- Present on disk → upsert file, clear `missing_at`
- Absent → set `missing_at`; do not delete DB rows or filesystem content
- **Library scans discover Files only** — they must not create `ingest_items` or move files
- **Association jobs** (`library.associate`) connect Files to Representations for in-place indexing
- **Metadata resolution** (during association) establishes/enriches WEM identity

## Ingest architecture

Ingest is how new content enters Feylore. Libraries are where managed content lives after processing.

| Concept              | Role                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------- |
| **Library**          | Persistent destination (`libraries` + storage location + organization/normalization policies) |
| **Ingest root**      | Watched incoming source tree (nested directories supported)                                   |
| **Upload**           | Browser transport into staging; creates the same `ingest_items` records                       |
| **`ingest_items`**   | Durable ingestion state (source of truth for UI and recovery)                                 |
| **`ingest.process`** | pg-boss execution only; status lives on `ingest_items`                                        |

Pipeline (Books V1): discover → queue → analyze → identify → metadata → optional EPUB normalization → organize → library.

Library scan and ingest are distinct operations. Scan indexes existing library files in place; ingest moves or copies new files through the pipeline.

Upload limits (`MAX_UPLOAD_BYTES`, `MAX_UPLOAD_FILES`) apply to browser transport only, not filesystem ingest capability.

### Processing administration

Operations → Processing (`/admin/processing`) configures per-module ingest policy independently from the job monitor. Policy is module-first (`ProcessingModuleId`), not operation-first.

- **Persistence:** `system_settings.processing.policies`
- **Resolution:** `ProcessingPolicyResolver` supplies ingest processors with module policy; `ProcessingDestinationResolver` maps destination/archive intents to mounted storage (mono-directory fallback; ambiguous/unresolved states never guess a mount)
- **Templates:** shared `processing-templates.ts` renders title vs path separately; server validates fields per module
- **Library bridge:** saving policy syncs organization/normalization fields on the default library for the content type (migration aid; policy stores intent only)
- **Lifecycle:** verify destination → `destination_verified` → `retireSource()` → remove empty `.ingest-uploads/{uploadId}/` staging directories

Books-only capabilities in V1: EPUB 3.3 conversion policy, Read Along policy flag (engine not implemented), tar.gz original retention when archive mount resolves.

## Job architecture

pg-boss with Feylore job view. Implemented: `library.scan`, `library.associate`, `metadata.ingest`, `ingest.process`, `download.prepare`, `artwork.fetch`, `search.index`, `metadata.person.fetch`. `media.process` uses a `MediaDomainProcessor` registry; concrete processors register per domain (Audiobooks in Pass 6). Cancellation: queued cancellable; running cooperative cancel; `cancelled` ≠ `failed`; no retry of cancelled jobs.

## Playback architecture

Shared playback module (`src/server/modules/playback/`). See [PLAYBACK.md](./PLAYBACK.md).

- **Personal progress** — server `user_progress` with `{ kind: "playback" }` locators; distinct from reading locators.
- **Client queue** — `PlaybackProvider` local state only; not synced to server.
- **Watch-party** — future layer above the provider; out of Pass 4 scope.

Clients receive stream URLs only via authorized manifests. `PlaybackEngine` interface with `AudioEngine` (Pass 4); `VideoEngine` in a later pass.

## Metadata architecture

Stable contract: `feylore.metadata.provider.v1`. Registry in core; implementations in `src/providers/`.

**Source tiers:** imported information (file-derived evidence), metadata providers (externally refreshed evidence), and Feylore canonical (normalized state). Built-in extractors (EPUB/OPF, filename, tags) are imported information — not providers users can sync from.

**Provenance** (`metadata_field_provenance`) explains the current canonical value and updates only when that value changes. **Overrides** (`field_overrides`) protect canonical fields from automatic merge/refresh. These are independent concerns.

All metadata-editor field mutations route through `MetadataCanonicalService`.

Person metadata editing reuses the same override/provenance provider surface with a person-specific service (`PersonCanonicalService`, no auto-merge) — see `docs/People.txt`. Its fetch job is `metadata.person.fetch` and the first person provider is Wikidata (registered in the standard registry, auto-enabled).

Secrets never returned via API.

## Authentication

Opaque random session token in httpOnly cookie. Server stores hash only. No JWT.

CSRF: Origin/Referer validation on state-changing requests; SameSite=Lax cookies; no credentialed arbitrary-origin CORS.

Security headers: CSP, X-Content-Type-Options, frame protections, Referrer-Policy, Permissions-Policy.

## PWA / offline

- App shell: Workbox precache
- User media: explicit downloads → Cache Storage `feylore-downloads` + IndexedDB registry
- File streams are never default-cached by the service worker

## Integration strategy

Distinguish: metadata providers, outbound HTTP (SSRF-safe), integration configuration, future webhooks. Adapters at boundaries; no third-party assumptions in domain code.

## Configuration and secrets

See [DEVELOPMENT.md](./DEVELOPMENT.md). Secrets never logged or returned to clients. Integration/provider credentials encrypted server-side.
