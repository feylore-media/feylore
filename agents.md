# Feylore — Agent Guidelines

## 1. Project Identity

Feylore is a self-hosted personal library and media application for organizing, discovering, reading, listening to, watching, and enjoying a user's digital collection.

Feylore is intended to bring books, audiobooks, podcasts, music, movies, television, photos, tabletop RPG material, and related media into one coherent application without pretending that all media behaves the same way.

The product should feel like a carefully designed personal library rather than a generic enterprise dashboard.

The project name is **Feylore**.

The application is primarily English. Internationalization is planned from the beginning, but translation content is not an AI-generation task. Translation strings should be organized by domain and prepared for external translation management.

---

## 2. Core Product Principles

For every media domain, begin domain modeling from the applicable schema.org CreativeWork type and related schema.org vocabulary. Prefer established CreativeWork terminology and relationships wherever they accurately describe the domain. Introduce Feylore-specific concepts only when the concept represents library-management state, application behavior, storage, user state, permissions, or another concern not adequately represented by the standard.

Schema.org is the default conceptual vocabulary for creative works across Feylore, not merely a metadata-provider mapping.

### 2.1 Library first

Feylore is fundamentally a library application.

Files are implementation/storage concerns. User-facing library items are bibliographic Works reached through **library membership**, not files or filesystem paths.

Do not make filesystem structure the primary user-facing model.

Do not assume that a filename, directory, or file extension is the identity of a library item.

### 2.2 Media types are distinct

Books, audiobooks, music, movies, television, photos, and TTRPG material have different domain requirements.

Do not force all media into one generic model merely because doing so appears architecturally elegant.

At the same time, do not duplicate infrastructure unnecessarily.

Shared infrastructure should exist for things such as:

- users
- permissions
- files
- storage
- metadata
- search
- artwork
- downloads
- jobs
- activity
- ratings
- favorites
- collections
- external identifiers

Domain-specific behavior belongs in the appropriate module.

### 2.3 No artificial "primary representation"

A work may have multiple representations.

For example, a user may have:

- PDF
- EPUB
- CBZ
- audiobook

These should not be modeled as a chain in which one representation is inherently the "primary" library item.

Deleting one representation must not implicitly invalidate the others.

Where appropriate, representations may be related to the same underlying work or content, but the system must remain valid if any individual file is removed.

### 2.4 Metadata and files are separate concerns

Metadata describes content.

Files are physical/digital resources available to the application.

Never make metadata correctness dependent upon a particular filesystem path.

Never make deleting a file equivalent to deleting the conceptual library entity unless the user explicitly chooses that behavior.

### 2.5 Metadata is not ownership

Metadata can come from external providers, embedded metadata, filenames, directory structures, user edits, or future metadata services.

The system must preserve provenance where practical.

User modifications should not casually be overwritten by an automated metadata refresh.

### 2.6 Opinionated over feature-bloated

Do not copy Plex, Jellyfin, Calibre, or another product feature-for-feature.

Use other applications as references and comparison points, not as requirements.

Every feature should have a reason to exist in Feylore.

---

## 3. Standards and Modeling

When a domain concept is ambiguous, prefer established standards over inventing terminology.

For metadata and creative works, use `schema.org/CreativeWork` as a routine conceptual reference point.

More specific schema.org types may be used when appropriate.

Do not blindly map every internal database object to schema.org.

Feylore uses **Work → Expression → Manifestation** as its **bibliographic identity layer**. Expressions are associated with Works; Manifestations are associated with Expressions.

**Representation is not a fourth WEM level.** It is a Feylore application/storage abstraction: application-level digital access representation; optionally associated with a Manifestation; may contain one or more Files.

**Library membership**, **Representation**, **File**, and **user state** remain separate concerns that do not collapse into WEM.

Do not expose WEM complexity in UX or require complete WEM data before a file is usable.

Use standards to resolve ambiguity, not to make the application unnecessarily complex.

---

## 4. Architecture

The application should be modular.

A module should own its domain behavior while relying on shared platform infrastructure where appropriate.

A useful conceptual structure is:

```text
Platform
├── Authentication
├── Users
├── Roles & Permissions
├── Configuration
├── Storage
├── Files
├── Jobs
├── Metadata
├── Search
├── Downloads / Offline
├── Notifications
├── Activity
└── Integrations

Media Domains
├── Books
├── Audiobooks
├── Music
├── Movies
├── TV
├── Photos
└── TTRPG

Experience
├── Home
├── Search
├── Collections
├── Playback
├── Reading
├── Activity
├── Statistics
└── Social
```

This is a conceptual boundary, not a requirement to create one package per line immediately.

Avoid both extremes:

- one enormous shared domain model
- dozens of tiny packages with no meaningful boundaries

Choose boundaries based on ownership and behavior.

---

## 5. Module Development

Each major module should be implemented as its own deliberate pass.

Do not implement Books, Music, TV, Photos, etc. simultaneously unless a shared dependency genuinely requires it.

A module pass should consider:

1. Domain model
2. Relationships
3. API
4. Authorization
5. Storage/file behavior
6. Metadata behavior
7. Background jobs
8. Search/indexing
9. UI information architecture
10. Playback/reading behavior where applicable
11. Downloads/offline behavior
12. Tests
13. Accessibility
14. Mobile/PWA behavior

A module is not complete merely because its primary screen renders.

---

## 6. Core Domain Rules

### Users

Users are first-class entities.

Do not assume there is only one user.

Features involving activity, ratings, progress, favorites, recommendations, downloads, and privacy must be scoped appropriately to users.

### Roles

Role management is part of the foundation.

Authorization should be explicit.

Do not scatter ad-hoc role checks throughout the frontend.

The backend must remain authoritative for authorization.

### Files

Files are resources associated with library content.

A single conceptual item may have multiple files.

A file may be replaced or removed without destroying unrelated metadata or representations.

Filesystem paths should be abstracted behind storage services rather than deeply embedded throughout domain code.

### Storage

Storage locations should be configurable.

The system must support the possibility of:

- application-managed storage
- externally managed/read-only storage
- future specialized volumes

Integrations should not require Feylore to rename or reorganize a user's existing collection.

By default, Feylore may take ownership of managed files where appropriate, while preserving an explicit model for read-only or specially managed volumes.

Do not silently modify an existing user's filesystem organization.

### Metadata

Metadata acquisition should be asynchronous where appropriate.

Metadata should have provenance.

Automated metadata updates should respect user overrides.

Metadata failures should not make files unusable.

### Background jobs

Long-running operations should not block HTTP requests unnecessarily.

Examples include:

- scanning
- importing
- metadata lookup
- artwork retrieval
- indexing
- transcoding
- filesystem operations
- synchronization

Jobs must be observable and recoverable.

### Search

Search is shared infrastructure but domain-aware.

Do not flatten all media into a single undifferentiated result model.

Search should be capable of understanding:

- books
- authors
- series
- audiobooks
- narrators
- artists
- albums
- tracks
- movies
- shows
- episodes
- photos
- collections

The exact search technology should be selected during the foundation pass.

---

## 7. Filesystem and Integration Philosophy

External tools may manage, download, rename, or organize content.

Feylore should integrate with them without allowing their assumptions to define Feylore's domain model.

Examples include tools such as download managers, metadata managers, audiobook tools, ebook tools, or media automation systems.

An integration should have a clear boundary:

```text
External System
      ↓
Integration Adapter
      ↓
Feylore Service
      ↓
Feylore Domain
```

Do not spread external API assumptions throughout the application.

Do not create direct coupling between domain entities and a third-party service.

---

## 8. Privacy

Privacy is a core product feature.

User activity, ratings, reading history, listening history, watching history, statistics, photos, and social activity should have explicit visibility rules.

Do not assume that because information exists in the database it should appear on another user's profile.

Privacy defaults should generally be conservative.

Photos require particularly careful handling.

---

## 9. Offline and Downloads

Offline support is a V1 requirement.

Do not treat downloads as a later architectural afterthought.

The foundation should establish abstractions capable of supporting:

- download requests
- download state
- local availability
- synchronization
- offline playback/reading
- cache management
- removal of downloaded copies
- user/device association where required

The exact implementation may differ by media type.

---

## 10. PWA and Mobile

Feylore is a web application with a first-class mobile/PWA experience.

Mobile is not merely a narrow desktop viewport.

Navigation, playback, reading, downloads, touch interactions, offline behavior, and information density should be considered from the beginning.

Do not create desktop-only architecture and promise to fix mobile later.

---

## 11. UI / UX Principles

Feylore should feel like a personal library.

Avoid generic SaaS/dashboard aesthetics.

Avoid excessive:

- cards
- pills
- rounded containers
- shadows
- gradients
- decorative statistics
- empty whitespace
- nested panels

Do not put a right-hand rail into the primary application layout unless a specific feature genuinely requires one.

Information hierarchy should come from typography, spacing, grouping, artwork, and navigation rather than turning every piece of information into a card.

The interface should be calm, readable, and content-focused.

Dark mode should be supported from the beginning and is the primary design experience. See [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) for adaptive interaction patterns, semantic token architecture, and dark-first visual guidance.

Accessibility is required, not a post-V1 cleanup.

---

## 12. Navigation

Navigation should reflect meaningful product domains.

A possible high-level structure is:

```text
Home

Library
├── Books
├── Audiobooks
├── Music
├── Movies
├── TV
├── Photos
└── TTRPG

Collections

Search

Activity

Settings
```

The final navigation may change during implementation.

Do not create a top-level navigation item merely because a feature exists.

For example:

- magazines belong with Books
- news belongs with Books initially
- podcasts belong with Audiobooks/audio
- live TV belongs with TV

These are product organization decisions, not technical limitations.

---

## 13. Books and Audiobooks

Books remain a distinct domain from audiobooks.

An audiobook may be related to a book without being modeled as merely another file format of the book.

A user may possess multiple representations of related content.

For example:

```text
Book (Work — bibliographic identity layer)
├── Expression
│   └── Manifestation
│       └── Representation (EPUB) → file(s)
├── Representation (PDF) → file(s)   [may exist without full WEM chain]
└── Representation (CBZ) → file(s)

Audiobook (separate Work — not another format of Book)
└── Representation → audio file(s)
```

These may be related when metadata indicates they represent the same underlying literary work.

Do not create a hierarchy where deleting the EPUB deletes the book Work or deleting the audiobook deletes the underlying literary work.

Podcasts are initially part of the audiobook/audio experience rather than a separate primary sidebar module.

---

EPUB and Reader

Feylore's ebook reader should use the current Readium Web/TypeScript ecosystem as its primary EPUB foundation rather than implementing EPUB rendering from scratch.

The architecture targets EPUB 3.4 as the forward-looking standard while maintaining compatibility with valid EPUB 3.x publications, including EPUB 3.3.

The internal EPUB architecture must not be designed around only the EPUB 3.3 feature set. It should accommodate evolving EPUB 3.4 capabilities without requiring a reader rewrite.

Readium is responsible for EPUB publication parsing, rendering, navigation, pagination, and standards-oriented reading-system behavior. Feylore owns the application-level reader experience, including authentication, library integration, reading progress, bookmarks, annotations, downloads, offline state, user preferences, and UI.

EPUB Media Overlays are a V1 requirement. Feylore should support synchronized text/audio playback when an EPUB provides Media Overlays.

Read-aloud is a V1 reader capability. Where Media Overlays are available, they should be preferred. Where they are not available, Feylore should provide a TTS-based fallback where the platform permits it.

Do not conflate EPUB Media Overlays, TTS read-aloud, and standalone audiobook playback. They are separate capabilities.

Do not couple the Books domain directly to Readium implementation details. Use an application-level reader abstraction.

## 14. Music

Music is a first-class domain.

Do not model music as a special case of books or generic files.

The domain should support concepts such as:

- artists
- albums
- tracks
- genres
- playlists
- playback
- queue
- favorites
- progress/history
- downloads
- artwork
- metadata

The music player should eventually be capable of behaving like a real media player rather than a generic HTML audio control.

---

## 15. TV and Movies

Movies and TV are distinct media domains.

TV should support:

```text
Show
└── Season
    └── Episode
```

Live TV belongs under TV.

Movies may support collections where appropriate.

Playback state and progress are user-specific.

---

## 16. Photos

Photos are a first-class domain.

Do not force photos into the same browsing model as books or movies.

Photo organization should be optimized for visual browsing, chronology, albums, and privacy.

Avoid assuming that photos are simply "images attached to an item."

---

## 17. TTRPG

TTRPG is a specialized library collection/domain.

PDF is a file format, not a TTRPG domain.

A PDF may belong to a book, TTRPG material, or another domain.

Do not create a generic "PDF library" merely because PDFs are common.

The same underlying file/content may potentially be associated with multiple meaningful library contexts, but this should be implemented carefully to avoid unnecessary performance costs and ambiguous ownership.

---

## 18. Collections and Relationships

Do not assume a strict hierarchy where the product concept is naturally many-to-many.

Examples:

- a book may belong to multiple collections
- a track may belong to multiple playlists
- a work may have multiple representations
- an item may be associated with multiple contextual categories

However, many-to-many relationships should not be introduced indiscriminately.

Consider query performance, indexing, caching, and UX before creating broad polymorphic relationship systems.

Prefer explicit relationships when they provide clearer domain semantics.

---

## 19. Ratings, Favorites, Progress, and History

These are user state, not metadata.

A provider saying a book has a rating does not mean the user rated it.

Keep separate:

- external metadata
- user rating
- user favorite
- reading progress
- listening progress
- watching progress
- history

Do not overwrite user state during metadata refreshes.

---

## 20. Internationalization

The application language is English.

Internationalization should be designed into the application from the start.

Translation strings should be organized by domain/module.

Initial locale structure should support:

```text
en
en-GB
fr
de
```

English is the fallback when a localized string is unavailable.

Translation content should not be generated by the application or automatically invented by AI during implementation.

The project should be structured so that Crowdin or another translation-management service can manage the actual translated strings later.

Avoid hard-coding user-visible strings throughout components.

---

## 21. Testing

Tests are part of implementation, not cleanup.

At minimum, appropriate modules should contain:

- unit tests
- integration tests
- API tests
- authorization tests
- domain behavior tests
- important UI tests
- regression tests for significant bugs

Do not write tests that merely reproduce implementation details.

Test behavior and domain guarantees.

Critical invariants should have explicit tests.

Examples:

- deleting one representation does not delete unrelated representations
- unauthorized users cannot access private activity
- user ratings survive metadata refresh
- a failed metadata provider does not make content inaccessible
- read-only storage is not modified
- downloads can be removed without deleting the source library item

---

## 22. Performance

Do not prematurely optimize everything.

Do establish sound boundaries.

Pay particular attention to:

- large libraries
- filesystem scanning
- metadata ingestion
- search indexing
- artwork
- photo collections
- playback
- downloads
- many-to-many relationships
- background jobs

Avoid designs that require loading an entire library into memory merely to render a page.

Prefer pagination, cursor-based retrieval, filtering, indexing, caching, and asynchronous processing where appropriate.

---

SECURITY IS A FOUNDATION REQUIREMENT

All external input is untrusted.

Filesystem:

- Never accept an arbitrary filesystem path from a client as an authorization mechanism.
- Never concatenate user-controlled path components into filesystem paths.
- Resolve paths against an explicitly configured storage root.
- Verify the canonical/resolved path remains inside the authorized root.
- Defend against ../ traversal, encoded traversal, alternate separators, symlinks,
  junctions, reparse points, and platform-specific path behavior.
- Do not follow symlinks outside an authorized storage root unless explicitly supported.
- File identifiers should be opaque application identifiers, not filesystem paths.
- Never expose raw filesystem paths through the public API.

File serving:

- Files are served through authorization-aware application endpoints.
- Never expose storage directories directly to the web server.
- Verify authorization before opening/streaming a file.
- Support range requests where appropriate for media playback.
- Prevent arbitrary file reads.

Uploads/imports:

- Use allowlists for supported formats.
- Validate extension, detected media type, and file signature where possible.
- Do not trust client-provided MIME types.
- Apply file-size and request-size limits.
- Use safe generated temporary/storage names.
- Never allow uploaded filenames to determine executable/storage paths.
- Treat archives as hostile input.
- Protect against archive bombs and excessive decompression.
- Extract archives into isolated temporary locations.
- Validate every extracted path before writing it.
- Do not execute uploaded content.

EPUB:

- Treat EPUB as an untrusted ZIP/container and HTML/XML document.
- Protect against path traversal during extraction.
- Do not allow EPUB resources to escape the publication root.
- Do not allow EPUB content to access arbitrary local filesystem resources.
- Isolate/sandbox active content according to the reader architecture.
- Carefully control external resource/network access.
- Sanitize or isolate content where required by the reading system.
- Preserve EPUB semantics rather than flattening the publication unnecessarily.

SSRF:

- Any server-side URL fetch must go through a centralized outbound-request service.
- Do not allow arbitrary user-provided URLs to be fetched directly.
- Allowlist URL schemes.
- Restrict ports.
- Validate destinations.
- Resolve DNS safely and defend against DNS rebinding/pinning issues.
- Block localhost, loopback, link-local, private, multicast, and other internal
  network ranges unless explicitly required by a trusted integration.
- Revalidate the destination after redirects.
- Prefer disabling redirects for security-sensitive fetches.
- Do not permit file://, gopher://, ftp://, data://, or other unnecessary schemes.
- Apply response-size, timeout, and redirect limits.
- Do not return raw upstream responses blindly to clients.

Rate limiting:

- Rate-limit authentication endpoints.
- Rate-limit password/account recovery.
- Rate-limit metadata/provider requests.
- Rate-limit arbitrary URL/import operations.
- Rate-limit expensive scans and processing jobs.
- Rate-limit file/download endpoints appropriately.
- Apply both per-user and global/system limits where appropriate.
- Avoid rate limits that make legitimate large-library operations unusable.
- Background jobs should have concurrency limits.

Secrets:

- Never expose secrets to clients.
- Never store provider credentials in media metadata.
- Do not log access tokens, passwords, cookies, API keys, or sensitive URLs.

Logging:

- Log security-relevant events.
- Do not log secrets or sensitive file contents.
- Record failed authorization attempts where appropriate.
- Record administrative actions.

---

## 24. Code Quality

Prefer boring, explicit code over clever abstractions.

Do not create abstractions until there is a demonstrated need.

Do not duplicate substantial domain logic merely to avoid creating a shared service.

Use consistent naming.

Keep functions and components focused.

Prefer domain terminology over implementation terminology.

Comments should explain why something exists when the reason is not obvious from the code.

Do not use comments as a substitute for clear code.

---

## 25. Dependency Policy

Do not add a dependency merely because it solves a small problem conveniently.

Before adding a dependency, consider:

- maintenance
- security
- bundle size
- license
- project maturity
- compatibility
- whether the functionality belongs in core code

Foundation dependencies should be selected deliberately during the architecture pass.

---

## 26. AI / Cursor Rules

Cursor is an implementation assistant, not the product owner.

When requirements are ambiguous:

1. Inspect existing project documentation.
2. Inspect the existing implementation.
3. Prefer established project decisions.
4. Identify contradictions.
5. Do not silently invent a major architectural decision.
6. Record consequential decisions in documentation.

Do not rewrite unrelated code merely because it could be improved.

Do not replace working architecture with a preferred pattern without a concrete reason.

Do not generate placeholder functionality that looks complete but is not actually implemented.

Do not claim a feature is complete when it only has UI scaffolding.

---

## 27. Implementation Pass Discipline

Before beginning a module, identify:

- what the module owns
- what it consumes from shared infrastructure
- what it exposes to other modules
- its domain entities
- its user actions
- its permissions
- its file behavior
- its metadata behavior
- its background work
- its search behavior
- its offline requirements
- its tests

At the end of the pass:

- run tests
- run type checking
- run linting
- inspect the resulting UI
- check mobile behavior
- verify authorization
- verify the scope boundary
- update documentation

Do not silently expand the module's scope.

---

## 28. V1 Scope Authority

`docs/V1-SCOPE.md` is the authoritative product scope document.

If implementation ideas conflict with V1 scope, stop and resolve the conflict rather than silently expanding V1.

A feature may be:

- V1
- V2
- Future
- Explicitly out of scope

Do not treat "interesting" as equivalent to "V1."

---

## 29. Definition of Done

A V1 feature is done when:

- its domain behavior is implemented
- its API is implemented where required
- authorization is enforced
- persistence is correct
- errors are handled
- background work is reliable where required
- metadata behavior is defined
- search behavior is defined where relevant
- mobile behavior is usable
- accessibility has been considered
- tests cover important behavior
- documentation reflects the implementation
- the feature does not violate established domain invariants

A page existing in the browser is not sufficient.

---

## 30. Guiding Principle

When uncertain, ask:

**What would make Feylore a better personal library rather than merely another media dashboard?**

Prefer the answer that preserves coherent domain boundaries, respects the user's files and data, minimizes unnecessary complexity, and produces a calm, useful library experience.

---

## 31. Foundation Implementation Reference

Stack: TypeScript, Node.js 24 LTS, Fastify 5, Vite 8, React 19.2, React Router 8, PostgreSQL 16, Drizzle, pg-boss.

Documentation: see `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `docs/API.md`, `docs/AUTHORIZATION.md`, `docs/MEDIA-MODEL.md`, `docs/DESIGN-SYSTEM.md`, `docs/V1-SCOPE.md`.

Commands: `pnpm install`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
