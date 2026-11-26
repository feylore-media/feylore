# Feylore — Reader Architecture

**Authoritative scope:** [V1-SCOPE.md §22](./V1-SCOPE.md), [AGENTS.md §13](../AGENTS.md), [DESIGN-SYSTEM.md §16](./DESIGN-SYSTEM.md)

The web reader is a **client of the reading model**, not the owner of it.

---

## Ownership boundaries

| Layer | Owns | Must not own |
|-------|------|--------------|
| **ReaderSession** | Canonical `ReadingLocator`, progress sync coordination, preferences (account + device-local), bookmarks, annotations, text selection, overlay playback state, loading/error UI state | Readium types, manifest parsing, rendering, capability detection |
| **ReaderAdapter** | Publication load/render, navigation, TOC data, selection events, capability detection, Media Overlay transport | Independent location model; user-state persistence; chrome |
| **Reader chrome** | Panels, controls, layout, accessibility | Locators; bookmarks source of truth; overlay state |

**ReaderSession must not depend on Readium-specific publication types.** The adapter exposes Feylore-domain interfaces; Readium stays inside `EpubReadiumAdapter`.

---

## Reader contract

```text
Book
 └── Representation (EPUB)
      └── Publication
           ├── spine / readingOrder
           ├── TOC (optional)
           ├── resources
           └── Media Overlays (optional)

ReaderSession (client-agnostic)
 ├── canonical location (ReadingLocator)
 ├── progress sync coordination
 ├── preferences (account + device-local)
 ├── bookmarks (server-backed)
 ├── annotations (server-backed)
 ├── selection state (transient)
 ├── media-overlay playback state (session/transient)
 └── loading/error states

ReaderAdapter (Readium implementation)
 ├── publication load/render
 ├── capabilities (derived, exposed to session)
 ├── TOC / navigation primitives
 ├── selection events
 └── Media Overlay transport
```

**Navigation rule:** No reader feature maintains an independent location model. TOC, bookmarks, annotations, prev/next, overlays, and restoration all converge on `ReaderSession.goTo(ReadingLocator)`.

---

## ReadingLocator

Feylore's representation-independent locator ([`shared/books.ts`](../src/shared/books.ts)):

| Field | Purpose |
|-------|---------|
| `type` | Locator kind (default `epub-cfi`) |
| `cfi` | EPUB CFI when available |
| `href` | Spine resource href |
| `progression` | 0–1 within resource |
| `totalProgression` | 0–1 within publication |
| `title` | Optional chapter/section label |
| `locatorText` | Optional `{ before, highlight, after }` for annotation recovery |

EPUB implementations preserve CFI and integrate with Readium's locator model at the adapter boundary only.

---

## Preference and state ownership

| Scope | Fields | Persistence | Cross-client? |
|-------|--------|-------------|---------------|
| **Account** | `progressSyncEnabled` | `user_preferences.progress_sync_enabled` via API | Yes |
| **Device/client-local** | font, size, line height, theme, margins | `localStorage` (`feylore.reader.preferences`) | **No** — typography does not sync across devices |
| **Publication/session** | `currentLocator`, overlay playback, reading activity heartbeats | Session memory; locator and activity persisted when sync enabled | N/A |

When progress sync is enabled, the web reader reports progress (debounced PUT) and visibility-aware activity heartbeats (30s) to the reading progress APIs. Sessions are grouped server-side; qualification requires five minutes of active reading.

---

## Publication capabilities

```text
PublicationCapabilities
├── hasToc: boolean
├── isReflowable: boolean
├── hasMediaOverlays: boolean
├── supportsBookmarks: true (EPUB V1)
└── supportsAnnotations: true (EPUB V1)
```

Capability detection runs in the adapter after publication load. Chrome gates controls from capabilities (no overlay UI when `hasMediaOverlays === false`).

**Publication acceptance:** A valid EPUB is exposed through a normalized representation containing reading order, navigation, resources, and optional Media Overlay relationships, with paths validated against the EPUB root.

---

## Annotation lifecycle

```text
select text → selection toolbar (Highlight / Note) → POST annotation → list → goTo
```

Annotations store `ReadingLocator` plus optional `highlightText` and `locatorText` for reliable re-navigation.

---

## Media Overlays

### UX

```text
No overlay     → hide media controls; TTS fallback when platform permits (separate from overlays)
Overlay available → Play/Pause, prev/next segment, segment progress, synchronized active text
```

### Autoplay

Playback starts only on explicit user gesture (browser autoplay policy).

### Edge cases

| Event | Behavior |
|-------|----------|
| Manual chapter change during playback | Stop playback; update location via `goTo` |
| TOC jump during playback | Stop playback; navigate via `goTo` |
| End of overlay | Stop at end; remain at last segment |
| Missing audio / malformed SMIL | Show overlay error; reading continues |
| Leave/reopen reader | Restore reading position; do not auto-resume audio |
| Network lost mid-playback | Stop playback; preserve last saved progress |

### Appendix: Readium vs Feylore

| Concern | Readium (`@readium/navigator`) | Feylore |
|---------|-------------------------------|---------|
| EPUB render/nav | `EpubNavigator`, CFI, spine | Adapter wraps; session never imports |
| Timeline / segments | `publication.timeline`, `timelineItemChanged` | Adapter wires events → session overlay state |
| Overlay metadata | Expects `metadata.mediaOverlay` in RWPM manifest | Server enriches manifest from OPF |
| Overlay audio playback | No complete overlay player in EpubNavigator | Adapter `MediaOverlayController` owns audio + SMIL sync |
| TTS | Not provided | Separate Web Speech fallback; never conflated with overlays |
| Preferences | `EpubPreferences` | Device-local mapping in adapter |
| Progress/bookmarks/annotations | Not provided | Server APIs + ReaderSession |

---

## Error taxonomy

| Code | User-facing |
|------|-------------|
| `loading` | Opening publication… |
| `publication_unavailable` | This book is not available to read |
| `unsupported_format` | PDF/CBZ reading is not available yet |
| `malformed_epub` | This EPUB could not be opened |
| `resource_failure` | A required part of the book failed to load |
| `preferences_failure` | Reader settings could not be loaded |
| `bookmarks_failure` | Bookmarks could not be loaded |
| `annotations_failure` | Annotations could not be loaded |
| `overlay_failure` | Read-along audio could not be played |
| `offline_unavailable` | This book is not available offline |

---

## Offline boundary

**Reader consumes already-available cached/offline publication resources.** Download preparation, cache population, download management, and Downloads UX remain **Pass D**.

| Scenario | Expected behavior |
|----------|-------------------|
| Resources cached (Pass D) | Reader uses cache transparently |
| Not cached + offline | Clear error |
| Network lost mid-session | Graceful degradation; saved progress retained |
| Uncached resource required | Actionable error |

---

## Gap register (Pass B baseline)

| Gap | Severity | Phase |
|-----|----------|-------|
| EPUB manifest missing nav + mediaOverlay | Blocks overlays | B3 |
| Resource path traversal | Security | B3 |
| Publication routes lack library check | Security | B3 |
| Empty positions array | Progress accuracy | B1/B3 |
| `@readium/css` not loaded | Typography | B2 |
| progressSync in localStorage vs DB | Contract | B2 |
| Annotation locator text context | Highlights | B7 |
| No Media Overlay fixture | Verification | B4 |
| TTS conflated with overlays | Architecture | B4/B5 |

---

## Manual verification checklist

1. Normal EPUB
2. EPUB with TOC
3. EPUB with Media Overlays
4. EPUB without Media Overlays
5. Malformed EPUB
6. PDF-only book detail
7. CBZ-only book detail
8. Book with bookmarks
9. Book with annotations
10. Narrow viewport
11. Non-default persisted preferences
12. Reopen after location change

---

## Definition of done

Reader V1 provides a coherent EPUB reading session with persisted location, configured reader preferences, TOC navigation, bookmark management, text annotations, and EPUB Media Overlay playback when supplied by the publication. Unsupported PDF/CBZ formats are explicitly communicated without in-reader rendering. Reader state, errors, accessibility, and responsive behavior are handled without exposing implementation details. **No reader feature maintains an independent navigation/location model.**
