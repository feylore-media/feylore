# Feylore Design System

## Purpose

This document defines Feylore's visual language, information architecture, interaction model, responsive behavior, and UX principles.

It is a product-level design guide, not a component implementation specification.

The goal is consistency without forcing every media domain into the same visual structure.

Feylore is a personal library and media experience. It should feel like a place for the user's collection rather than a generic SaaS dashboard or a clone of an existing media server.

When a design decision is ambiguous, prefer the option that:

1. Makes the user's content more prominent.
2. Reduces unnecessary interface chrome.
3. Preserves the distinction between different media types.
4. Makes common actions discoverable without making every action permanently visible.
5. Works naturally with keyboard, pointer, touch, and assistive technologies.
6. Can support large personal libraries without becoming visually overwhelming.

# 1. Product Character

Feylore is a **dark-first, editorial, sophisticated library** application.

Feylore should feel:

- Personal
- Calm
- Content-first
- Editorial
- Sophisticated
- Tactile
- Discoverable
- Capable of handling large collections
- Respectful of the user's organization

It should not feel:

- Corporate
- Enterprise
- Like an analytics dashboard
- Like a generic CRUD application
- Like a Plex/Jellyfin clone
- Like a storefront
- Like a social-media feed
- Like an AI-generated dashboard

The personality should primarily come from typography, spacing, artwork, composition, motion, and carefully chosen details rather than excessive decorative theming.

**Reference inspirations** (learn from, do not copy branding): [Are.na](https://www.are.na/), [StoryGraph](https://app.thestorygraph.com/), and [Letterboxd](https://letterboxd.com/). Study their restraint, adaptive controls, content-first layouts, and willingness to use different UI patterns for different tasks.

## 1.1 Adaptive Interaction Design

Consistency should come from the **design language**, not from forcing every interaction into the same component.

Choose the UI pattern based on the user's task and the amount of complexity involved:

| Task | Pattern |
| --- | --- |
| Sorting | Compact menu |
| Quick status change | Inline control |
| Destructive action | Overflow menu |
| Collection organization | Exposed controls where appropriate |
| Contextual action | Hover or selection |
| Complex configuration | Dialog |
| Secondary option | Progressive disclosure |

Do not force every interaction into cards, pills, large buttons, or modal dialogs merely for visual consistency. Controls should appear where the user expects them, contain only the complexity appropriate to the task, and adapt to what the user is currently doing.

## 1.2 Design Decision Checklist

Before designing a new screen or component, answer:

1. What is the user trying to accomplish?
2. What information is actually necessary at this point?
3. What is the most natural interaction for that task?
4. What should be visible immediately versus progressively disclosed?
5. Can hierarchy and spacing solve the problem instead of another container?
6. Can the content itself provide the visual richness?

Only then choose UI components. Do not default to a generic "modern UI" pattern.

# 2. Information Architecture

Feylore's primary navigation is:

- Home
- Shelves
- Universes
- Books
- Audiobooks
- Music
- Movies
- TV
- Photos
- TTRPG

Secondary application destinations are:

- Activity
- Downloads
- Stats

Global application functions include:

- Search
- Add/import
- Profile
- Settings

The conceptual hierarchy is:

Content:

- Books
- Audiobooks
- Music
- Movies
- TV
- Photos
- TTRPG

Organization:

- Shelves
- Universes

Application:

- Activity
- Downloads
- Stats

# 3. Shelves

Shelves are a first-class Feylore concept.

A Shelf is a user-defined organizational space that can contain items from multiple media domains.

A Shelf may contain:

- Books
- Audiobooks
- Music
- Movies
- TV
- Photos
- TTRPG material
- Other supported library entities

Shelves are not restricted to one media type.

Shelves are not a generic metadata concept and should not be conflated with external collections, series, franchises, or universes.

A user should be able to add content to a Shelf through:

- Explicit Add to Shelf actions
- Drag and drop
- Multi-selection followed by Add to Shelf
- Contextual actions

Dragging content onto a Shelf is a meaningful interaction and should be supported wherever the interface permits it.

Shelves should remain useful for both small and very large libraries.

# 4. Universes

Universes provide a richer cross-domain view of related creative works.

A Universe may bring together related:

- Books
- Audiobooks
- Movies
- TV
- Music
- TTRPG content
- Other related creative works

Universes are not a replacement for the underlying media models.

A Universe does not replace the appropriate CreativeWork type.

Universes are a Feylore relationship and presentation concept.

For example, a Universe can provide a unified view of related books, audiobooks, movies, television adaptations, and TTRPG material while those underlying entities retain their own domain types and metadata.

Universe membership should therefore feel like a relationship/view rather than another generic folder hierarchy.

# 5. Application Shell

The application shell should establish a stable Feylore environment while allowing content-focused experiences to take over the screen when appropriate.

The desktop shell should generally contain:

- Primary navigation
- Global header/actions
- Main content region

The default top-level header should provide:

- Current location/context
- Global search
- Add/import action
- Profile

The application should not permanently reserve large areas of the screen for secondary controls.

Content should receive the majority of available space.

# 6. Sidebar

The sidebar is a navigation surface, not a permanent list of every available feature.

The sidebar should support expanded and collapsed states.

Expanded navigation should expose the primary destinations.

Collapsed navigation should use recognizable icons and tooltips/accessibility labels.

When a media module is selected, the interface may expose module-specific navigation or filters contextually.

The global sidebar should not become excessively tall simply because a module has many useful views.

For example, Books may expose contextual options such as:

- All
- Authors
- Series
- Recently Added
- Continue Reading
- Finished

Music may expose different options appropriate to music.

These module-specific options belong to the selected module and should not redefine the global navigation.

The navigation system should therefore distinguish:

Global navigation:

- Home
- Shelves
- Universes
- Media domains
- Activity
- Downloads
- Stats

Module navigation:

- Views
- Filters
- Domain-specific browsing modes

Contextual actions:

- Actions on selected content

# 7. Home

Home is a personalized starting point, not simply a statistics dashboard.

Home should prioritize things the user can meaningfully act on now.

Potential sections include:

- Continue Reading
- Continue Listening
- Continue Watching
- Recently Added
- Recommendations
- Recently Finished
- Activity
- Personalized suggestions

Recommendations should receive meaningful visual emphasis.

Recommendations should not be indistinguishable from ordinary library shelves.

Progress should also be prominent where it is useful.

For example:

- A book may show reading progress.
- An audiobook may show listening progress.
- A movie may show watch progress.
- A TV episode may show episode progress.
- Music may emphasize recently played/history rather than treating an album as a percentage-complete work.

Home should be configurable over time, but the default experience should provide useful content without requiring the user to construct a dashboard.

# 8. Activity

Activity communicates meaningful changes and events involving the user's library.

Examples include:

- A user finished a book.
- A user rated a book.
- A new item was added.
- A download completed.
- Metadata was updated.
- A user completed a movie or episode.

Activity should feel personal and contextual rather than like an administrative event log.

Where appropriate, activity can become a recommendation signal.

For example:

"Macy finished this book and gave it 5 stars."

The interface should distinguish meaningful activity from low-value technical events.

# 9. Recommendations

Recommendations are a first-class Home experience.

They should be visually highlighted and clearly distinguished from ordinary browsing results.

Recommendations may be based on:

- User activity
- Ratings
- Finished works
- Reading/listening/watching history
- Shelves
- Universes
- Related creative works
- Other recommendation signals

Recommendations must not obscure why something is being suggested when a reason can be provided.

Useful explanations include:

- Because you liked...
- From your Shelf...
- Related to...
- You recently finished...
- From this Universe...

Recommendations should never be allowed to overwhelm the user's actual library.

# 10. Content Cards and Lists

Cards are a tool, not the default representation for everything.

Use grids when artwork and visual browsing are important.

Use lists when metadata density and scanning are more important.

Use tables only where structured comparison genuinely benefits the user.

Do not force:

- Books
- Music
- Movies
- TV
- Photos
- TTRPG content

into an identical card design.

The presentation should reflect the content.

Artwork, title, creator, and meaningful metadata should generally receive visual priority.

Progress should be visible but should not dominate the artwork.

# 11. Selection

Opening and selecting content are distinct interactions.

Opening a title enters its detail or playback/reading experience.

Selecting content creates a temporary selection state without necessarily navigating away.

Selection should support:

- Single selection
- Multi-selection
- Keyboard selection
- Pointer selection
- Touch selection
- Contextual actions
- Drag and drop

Selection should not require permanent checkboxes across the entire interface.

Selection affordances may appear when:

- The user enters selection mode.
- The user invokes a selection action.
- The user begins a multi-select interaction.
- The platform requires an appropriate touch affordance.

Once selection exists, the interface should expose a contextual action bar.

# 12. Contextual Actions

Actions should be contextual to the current selection.

A single selected book might expose:

- Add to Shelf
- Remove from Shelf
- Download
- Mark Read
- Favorite
- Rate
- Edit Metadata
- Hide
- More

A multi-selection should expose only actions applicable to all selected items.

The UI must not expose an action that cannot meaningfully operate on the current selection.

Bulk operations should be implemented as actual bulk operations rather than simply issuing an uncontrolled sequence of independent requests.

Long-running bulk operations should communicate progress and completion.

# 13. Drag and Drop

Drag and drop is a meaningful organizational interaction.

The primary V1 use case is dragging content onto a Shelf.

The interface should provide clear visual feedback for:

- Valid drop targets
- Invalid drop targets
- Current dragged item
- Resulting action

Drag and drop must not be the only way to perform an operation.

Every important drag-and-drop operation must have an accessible alternative such as:

- Add to Shelf
- Move
- Assign
- Context menu action

Touch devices may use alternate interaction patterns rather than attempting to reproduce desktop drag and drop exactly.

# 14. Detail Pages

A title detail page should provide the information and actions necessary to understand and interact with a creative work.

The detail experience may include:

- Artwork
- Title
- Creators
- Description
- Metadata
- Relationships
- Series
- Universe
- Shelves
- Progress
- Available representations
- Download actions
- Playback/reading actions
- Recommendations
- User rating
- User state

The exact composition depends on the media domain.

Do not treat every title as merely a database record with an identical metadata form.

Creative works should feel like content, not CRUD entities.

# 15. Focused Experiences

Certain experiences should temporarily suppress normal application chrome.

Examples:

- EPUB reader
- Audiobook player
- Video player
- Full-screen photo viewer
- Other immersive experiences

These experiences may hide or greatly reduce:

- Sidebar
- Global header
- Secondary navigation
- Nonessential controls

The content experience owns the screen.

This state should be reversible through an obvious and accessible exit/back action.

"Focused" or "locked" means that normal navigation is intentionally suppressed. It does not mean that the user is trapped or that navigation becomes impossible.

# 16. Reader

The ebook reader is an immersive experience.

The reader should prioritize:

- Text
- Reading position
- Legibility
- Navigation
- Accessibility

Reader controls should be discoverable without permanently occupying large areas of the screen.

The reader should support the EPUB architecture defined by the Books module, including:

- Reflowable EPUB
- Fixed-layout EPUB
- EPUB navigation
- Reading order
- Media Overlays
- Read-aloud
- Reading progress
- Bookmarks
- Annotations
- Offline reading

The reader should use the chosen EPUB rendering foundation rather than implementing a second independent EPUB rendering system in the UI.

# 17. Reading and Playback Progress

Progress is user state, not metadata.

Progress must be associated with the user's relationship to a representation.

Progress should not be reduced to a single percentage.

For EPUB, progress should preserve a standards-compatible locator, including EPUB CFI where appropriate, together with useful progression and contextual location information.

For audiobooks, progress should use temporal position.

For video, progress should use temporal position and relevant media context.

For other media, use the appropriate domain-specific locator.

The underlying progress system should be representation-independent so that different clients can synchronize through Feylore.

# 18. Cross-Client Synchronization

Progress synchronization should be enabled by default and may be disabled by the user.

The canonical progress state belongs to Feylore.

Supported clients may include:

- Feylore Web Reader
- Feylore device/mobile clients
- KOReader integrations
- Other compatible reading clients

The synchronization system must not depend on a particular reader implementation.

EPUB locations should preserve EPUB CFI where available and use a broader locator model so that the same progress system can support other media.

Audiobook progress should synchronize independently using temporal positions.

Where Feylore can establish a sufficiently reliable mapping between an EPUB and an audiobook representing the same creative work, progress may be synchronized across those representations.

The system must not assume that equal percentage progress means equivalent content.

Media Overlays provide a particularly strong synchronization mechanism because the publication explicitly defines relationships between text and audio.

# 19. Search

Search is global.

It should be accessible from the primary application header and should search across relevant Feylore entities.

Depending on the module, search may include:

- Creative works
- Authors
- Creators
- Narrators
- Artists
- Albums
- Tracks
- Movies
- TV shows
- Episodes
- Universes
- Shelves

Search results should preserve media context rather than presenting an undifferentiated database search.

Search should support progressive refinement through appropriate filters and facets.

# 20. Add / Import

The global `+` action is the primary creation/import affordance.

It may provide:

- Import files
- Add media
- Create Shelf
- Other contextually valid creation actions

The menu should adapt to the current location when appropriate.

The `+` action should not become an enormous administrative command palette.

Import and processing operations should provide clear state:

- Queued
- Processing
- Completed
- Failed

# 21. Downloads

Downloads are a first-class application concern.

The Downloads destination should communicate:

- Active downloads
- Queued downloads
- Completed downloads
- Failed downloads
- Offline availability

Downloads should not be confused with the representation itself.

A downloaded representation remains the same library/media representation; download state describes the user's local availability of it.

# 22. Stats

Stats provide optional analytical views of the user's activity.

Stats should remain secondary to content and activity.

Examples include:

- Books read
- Listening time
- Watch time
- Recently completed works
- Activity over time
- Media distribution

Stats should be useful without turning Home into an analytics dashboard.

Do not invent metrics simply because they are easy to calculate.

# 23. Responsive Design

Desktop and mobile should share the same information architecture but need not share identical interaction patterns.

Desktop may use:

- Expanded sidebar
- Collapsed sidebar
- Hover states
- Drag and drop
- Keyboard shortcuts
- Dense multi-column layouts

Mobile may use:

- Compact navigation
- Bottom navigation where appropriate
- Touch selection
- Long press
- Swipe gestures
- Full-screen content experiences

Do not simply shrink the desktop layout.

The interaction model should be intentionally designed for each input environment.

# 24. Accessibility

Accessibility is a foundational requirement.

The interface must support:

- Keyboard navigation
- Visible focus
- Screen readers
- Accessible names
- Appropriate semantic HTML
- Sufficient contrast
- Reduced motion
- Increased text size
- Touch targets appropriate to the platform

Color must never be the sole carrier of meaning.

Drag and drop must always have an accessible alternative.

Selection must be accessible without requiring a pointer.

Focused experiences must retain accessible navigation and an obvious exit mechanism.

# 25. Motion

Motion should communicate:

- State changes
- Navigation
- Continuity
- Hierarchy
- Spatial relationships

Motion should not exist merely for decoration.

Respect reduced-motion preferences.

Reader and player transitions should be subtle enough not to interfere with the content experience.

# 26. Visual Language

Feylore should prioritize:

- Typography
- Spacing
- Artwork
- Composition
- Alignment
- Subtle separation
- Clear hierarchy
- Dividers and tonal surface changes

Avoid overuse of:

- Cards
- Shadows
- Pills
- Rounded containers
- Gradients
- Decorative statistics
- Excessive badges
- Excessive borders
- Glassmorphism
- Floating panels
- Giant gradients
- Decorative boxes around every piece of information
- Saturated neon purple or excessive pink
- Fantasy or game UI chrome

The interface should feel cohesive without making every element look like a separate floating object. Let media artwork and content provide much of the visual richness.

# 27. Icons

Feylore uses **[Solar Icons](https://solar-icons.vercel.app/)** (`@solar-icons/react`) as the sole general-purpose interface icon library. Do not add Lucide, Heroicons, react-icons, or other icon packages.

Implementation: `src/web/components/icons/` — `Icon` wrapper, `NavIcon`, `ShelfIcon`, registries, and UI affordance helpers. Import Solar glyphs only through these registries, not ad-hoc across the app.

## Variants

| Variant | Solar weight | Use |
| --- | --- | --- |
| Outline | `Outline` | Default UI actions: add, close, drag, back, inactive nav, toolbar controls |
| Line duotone | `LineDuotone` | Selective identity: active sidebar nav, selected shelf icons, shelf/media identity in headers |

Two-tone is **restrained**, not decorative. Most icons stay single-color outline. Do not use duotone for every control or list row.

## Color tokens

Icon components are **mode-agnostic**. Palette values live only in `src/web/styles/themes/feylore.css`. Components reference semantic tokens; never hard-code hex in TSX or module CSS.

| Token | Role |
| --- | --- |
| `--color-icon` | Default icon color (typically muted text) |
| `--color-icon-identity` | Duotone primary — warm rose/pink |
| `--color-icon-identity-secondary` | Duotone secondary — muted antique gold |

Dark (`:root`, default) carries the canonical rose/gold expression. Light (`[data-theme="light"]`) remaps the same token names with independently tuned values.

## Attribution

The Solar icon pack by [480 Design](https://www.figma.com/community/file/1166831539721848736) is licensed under CC BY 4.0. See `LICENSE-THIRD-PARTY`.

# 28. Theme Architecture

Dark mode is the **primary design experience**. Light mode is a first-class parallel expression of the same design system, not a simple color invert.

## Modes and themes (V1)

- **Light** and **dark** are the only supported modes in V1.
- Both modes are expressions of the **default Feylore theme** (neutral-to-plum surfaces, violet/plum/mauve accents).
- V1 does **not** include a theme marketplace, theme editor, user-selectable alternate visual themes, or runtime theme engine.

## Semantic tokens vs theme values

Separate **semantic tokens** (role names) from **theme-specific values** (hex/rgb):

| Token | Role |
| --- | --- |
| `--color-paper` | Deepest app background |
| `--color-surface` | Primary UI surfaces |
| `--color-surface-muted` | Hover, secondary regions |
| `--color-surface-raised` | Menus, raised rows |
| `--color-text` | Primary text |
| `--color-text-muted` | Secondary text, metadata |
| `--color-border` | Structural borders |
| `--color-divider` | Hairline separation |
| `--color-accent` | Primary interactive emphasis |
| `--color-accent-muted` | Secondary emphasis |
| `--color-accent-subtle` | Low-opacity focus/hover backgrounds |
| `--color-icon` | Default icon stroke/fill |
| `--color-icon-identity` | Duotone primary (rose/pink identity) |
| `--color-icon-identity-secondary` | Duotone secondary (muted antique gold) |
| `--color-danger` | Destructive/error |

Implementation: `src/web/styles/tokens.css` (contract, non-color defaults) and `src/web/styles/themes/feylore.css` (default theme values). Components consume semantic tokens only — never hard-coded colors in module CSS.

`--color-ink` and `--color-ink-muted` are deprecated aliases for `--color-text` and `--color-text-muted`.

## Token discipline

Use a **small semantic vocabulary**, not a token explosion (~15 color roles in V1). Adding a token requires a new semantic role, not a new shade or component-specific need. If the difference is appearance only, adjust the theme file or compose with opacity — do not add `--color-nav-hover`, `--color-book-link`, or similar.

## Default Feylore palette

**Surfaces:** deep neutral-to-plum charcoals (muted, low-chroma). Not pure black, not warm brown. Surfaces stay neutral so cover artwork and photos remain visually dominant.

**Accents:** warm violets, plums, mauves, and restrained pink/rose for links, focus rings, active nav, and key interactive emphasis. Accents are a **visual identity layer** defined in the theme file and refinable without changing component structure. Avoid saturated neon purple, candy pink, and fantasy/game UI tropes. Rose/pink is accent-tier only — never a surface color.

Shadows (`--shadow-md`) are exception-only; prefer dividers and tonal surfaces.

Reader themes may have additional controls appropriate to reading.

## Data visualization (Stats)

Stats charts (see `docs/STATS.md`) are hand-rolled SVG with no chart dependency.
They reuse the existing semantic tokens — no data-viz-specific color tokens are
added, per token discipline above:

| Role | Token |
| --- | --- |
| Primary series (completions, heat density) | `--color-accent`, used sparingly |
| Secondary series (plays) | `--color-accent-muted` |
| Axes, tick labels, captions | `--color-text-muted` |
| Gridlines, cell outlines | `--color-divider` |

Rules: quiet grids; data-first titles instead of decorations; tabular numerals
(`font-variant-numeric: tabular-nums`) for all axes and counts; month/heat
labels never rely on color alone (every mark carries a text label, `<title>`,
or `aria-label`); no animation, so `prefers-reduced-motion` is safe by
construction. Native `<meter>` is preferred for single-series distributions
(ratings, genres, release years) for built-in accessibility.

## Future extensibility

Structure themes so a future engine can add `themes/other.css` remapping the same semantic tokens via a root attribute (e.g. `data-visual-theme`) without rewriting components. Decorative mood or atmosphere beyond the default palette is deferred to that future identity layer.

# 29. Component Philosophy

Shared components should represent genuinely shared interactions.

Examples of good shared components:

- Navigation
- Search
- Selection toolbar
- Progress indicators
- Context menus
- Download indicators
- Dialogs
- Toasts/notifications
- Artwork containers
- Metadata rows

Do not create a universal component merely to eliminate visual variation.

A Book card, Album card, Movie card, and TTRPG item may share implementation primitives while having different visual compositions.

Consistency means consistent behavior, design language, and principles — not identical components or presentation for every task.

# 30. Loading, Empty, Error, and Offline States

Loading, empty, error, and offline states are designed experiences.

They should communicate:

- What is happening
- What the user can do
- Whether the state is temporary
- Whether data is unavailable
- Whether retrying is appropriate

Do not leave large blank areas while data loads without meaningful feedback.

Empty states should explain what the user can do next.

Errors should be understandable and should not expose internal implementation details.

Offline states should clearly communicate which content remains available locally.

# 31. Personalization

Feylore should feel personal without requiring extensive configuration.

Personalization may include:

- Home recommendations
- Continue sections
- Activity
- Shelves
- Reading preferences
- Playback preferences
- Theme
- Layout preferences

The system should establish sensible defaults before asking users to customize everything.

# 32. Design Decision Rule

Apply the **Design Decision Checklist** (§1.2) before adding new UI. When choosing between two viable designs, prefer:

1. The simpler interaction.
2. The content-focused layout.
3. The design that scales to large libraries.
4. The design that works across input methods.
5. The design that preserves domain distinctions.
6. The design that avoids unnecessary permanent chrome.
7. The design that makes the user's next useful action obvious.

## UI review checklist (PR self-review)

1. What is the user trying to accomplish?
2. What information is necessary at this point?
3. Is this the most natural interaction for the task?
4. What is immediate vs progressively disclosed?
5. Could hierarchy and spacing replace a new container?
6. Does content (artwork, typography) provide enough visual richness?
7. Are semantic tokens used instead of hard-coded colors?
8. Was dark mode reviewed first?
9. Do icons use Solar via the shared `Icon` wrapper and semantic tokens (no alternate icon libraries; no hard-coded icon colors)?

Do not add a UI element merely because the underlying feature exists.

Do not add a navigation destination merely because a feature has its own database table.

Do not force every module into the same layout.

Do not make the user understand Feylore's internal data model in order to use the application.

---

# 33. Foundation Implementation Reference

## Stack (August 2026)

- TypeScript + Node.js 24 LTS
- Fastify 5, Vite 8, React 19.2, React Router 8
- PostgreSQL 16, Drizzle ORM, pg-boss, i18next

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for full architecture.

## Documentation

| Document                                         | Purpose                       |
| ------------------------------------------------ | ----------------------------- |
| [docs/V1-SCOPE.md](./docs/V1-SCOPE.md)           | Product scope authority       |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)   | System architecture           |
| [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)     | Dev setup and commands        |
| [docs/API.md](./docs/API.md)                     | API conventions               |
| [docs/AUTHORIZATION.md](./docs/AUTHORIZATION.md) | Roles and permissions         |
| [docs/MEDIA-MODEL.md](./docs/MEDIA-MODEL.md)     | Files, metadata, user state   |
| [docs/DESIGN-SYSTEM.md](./docs/DESIGN-SYSTEM.md) | Visual and interaction design |

## Commands

```bash
pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev
pnpm test && pnpm typecheck && pnpm lint && pnpm build
```

---

# 34. Carried-Forward Interaction Contracts

## Selection and cross-domain actions

Domain collection views must support selection and bulk actions. Selected entities may participate in cross-domain actions such as Add to Shelf. Drag-and-drop is an enhancement, not the sole mechanism—every drag operation needs an accessible alternative.

## Sidebar behavior

Global navigation in the primary sidebar; collapses to icons. When a domain is active, contextual/module navigation may appear without changing global IA. No right-hand rail in the core layout.

## Shelves

Shelves are cross-domain, not a Books feature. Basic shelves use explicit membership. Advanced shelves use saved rules (evaluated when domain entities exist). Visibility (private/public) is separate from edit permissions.

## Typography roles

| Role                 | Use                                               |
| -------------------- | ------------------------------------------------- |
| Display / serif      | Titles, library character — **Libre Baskerville** |
| UI / sans            | Chrome, navigation, controls — **Source Sans 3**  |
| Body reading         | Long-form reading — **Literata**                  |
| Metadata / technical | IDs, secondary facts — **IBM Plex Mono**          |

Families may be substituted; hierarchy is stable.
