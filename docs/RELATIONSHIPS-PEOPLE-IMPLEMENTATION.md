# Relationships and People — implementation proposal

**Status:** scoped V1 dependency pass before TTRPG. `docs/V1-SCOPE.md` remains the authority for V1 scope; the wider cross-media experience is deferred.

## Purpose and existing foundation

Give library Works, People, and ordered Series useful connections without turning every file or metadata result into a library item. TTRPG consumes the shared typed relationship service and bounded Related read model; it does not own them. Cross-domain Shelves curate and present groups such as Critical Role.

The People foundation is already implemented in Passes 9.1–9.3: `people`, `person_credits`, provider identifiers, canonical editing, and library-only profiles. Reuse and extend it. Existing `book_series` and `audiobook_series` membership, `creative_work_relationships`, and `person_relationships` need an inventory and migration path before a new generic table is introduced. Do not create parallel sources of truth.

Books and audiobooks remain **separate Works** in Feylore. A related audiobook is not automatically an Expression of a Book Work. Work → Expression → Manifestation expresses bibliographic identity inside a domain; Representation and File express access and storage. Semantic relationships must not duplicate those structural links or contributor credits.

## Boundary

| Concern | Owner |
| --- | --- |
| Work, Expression, Manifestation identity | Canonical media model |
| Digital access and physical holdings | Representation, File, and library membership |
| Person identity, aliases, identifiers, metadata | Existing People model |
| Contributor roles and ordering | Existing `person_credits` and domain credit associations |
| Ordered membership | Series membership, with a migration path from existing series tables |
| Cross-media curation and landing pages | Shelves |
| Adaptation, containment, supplement, companion, and similar facts | Semantic relationship service |
| Bounded Related read projection | Shared relationship service, composed from existing identity, credits, Series, and semantic facts |
| External reference | Separate source identity and pointer, not a Work or library membership |
| Wishlist, progress, ratings | User/library state, not semantic relationships |
| Campaign organization | TTRPG extension and Clubs integration |

## Delivery sequence

### 1. Inventory and decisions

- Map current Work IDs and domain tables, `creative_work_relationships`, series membership, People credits, provider provenance, search, and access checks.
- Define which existing relationships are retained or migrated. Specify a single authoritative write path and reversible migration/backfill.
- Register allowed node and relationship types centrally, with endpoint validation and inverse presentation. Store one directed fact and derive the inverse; reject self-links and duplicate facts. Keep `related_to` sparing.
- Follow the V1 subset below. Keep Shelf showcase presentation, generic Related UI, and relationship editing out of this dependency pass.

### 2. Entity presence and identity promotion (conditional V1 work)

`managed` and `placeholder` describe Feylore entities or their library-facing presence. `external` is **not** a presence value: an external reference is a separate provider/source identity plus label and URL or identifier, with no invented Work, membership, or in-library URL. A managed Work may have read-only external files; a physical holding need not have a digital Representation. Define presence per user/library where appropriate, so one user's placeholder does not erase another user's holding.

```text
External reference → intentionally imported/tracked → Placeholder Work
Placeholder Work → holding/media acquired → Managed Work
```

Create placeholders only through intentional flows: missing Series entry, Upcoming, Wishlist/Want to Read/Pick Up, physical holding, Club selection, or explicit relationship. Provider search results remain suggestions. Implement the identity and promotion infrastructure in V1 only when an existing feature requires it; TTRPG does not wait for the full placeholder UX.

Before attaching incoming media, resolve stable identifiers and existing managed Works, then eligible placeholders. Promotion must preserve the existing Work ID, memberships, credits, user state, and relationships. Ambiguous matches require review; title-only matching must not silently merge. Test repeated ingest and promotion from placeholder to physical/digital holdings.

### 3. Semantic schema and service

Choose a constrained relationship schema after the inventory. Candidate fields: source kind/ID, target kind/ID, registered type, ordinal where meaningful, provenance, created/updated timestamps. Start with existing Work and Series identities; add Campaign when TTRPG needs it. Add external-reference targets only if a later feature requires them. Add Person only for semantic facts that credits and `person_relationships` cannot express. Shelf membership is outside this schema and must never be required to read or write a factual Work-to-Work relationship.

First support the existing Book ↔ Audiobook link in `creative_work_relationships`, named `related_edition` in the current API and shared constant. Preserve that stored predicate unless the inventory shows a compelling migration reason; use clear Book/Audiobook presentation labels without implying a shared WEM Work. This is the first cross-domain integration test. Register additional predicates only as required by an implemented feature. Candidate later types include `adapted_from`, `based_on`, `contains`, `companion_to`, `supplement_to`, `spin_off_of`, `sequel_to`, and `related_to`. Define inverses such as `adapted_as`, `contained_in`, and `prequel_to` when those predicates are introduced. Validate target existence, permissions, supported source/target combinations, and cycles for containment or ordered membership where applicable. Index both endpoint directions, type filters, and logical uniqueness. Preserve provider versus user/curator provenance and prevent provider refresh from overwriting user decisions. A Work can be adapted from, related to an audiobook, or supplement another Work regardless of either Work's Shelf membership.

Expose a bounded, authorized, one-hop **Related read projection** that can request specific groups independently: semantic Works, People/credits, Series context, and accessible Representations. Semantic relationship visibility, exact counts, and pagination run in SQL; only the requested page of visible targets is resolved by domain. Counts must not require loading target records. Candidate public routes follow existing domain slug conventions; do not invent a universal Work URL. Never expose arbitrary graph traversal as the standard client API.

### 4. People, Series, and Cross-Media Shelves

- Keep `person_credits` as the fast path for Book authors, audiobook narrators, movie cast, podcast participants, and future TTRPG contributors. Add missing role/credit integration through existing People services rather than a second `work_contributor` table.
- Keep Person profiles focused on Works visible in the viewer's library. Future placeholders require an explicit visibility rule and must remain visually subordinate to holdings.
- Consolidate ordered Series membership without losing existing Book and Audiobook positions. Series is the canonical structure for ordered membership. An omnibus or anthology is itself a containing Work.
- Use existing cross-domain Shelves for curated groupings and landing pages. Shelf membership expresses curation, not a factual semantic relationship. The relationship service must neither depend on Shelf membership nor infer semantic edges from it.
- Expand Shelf presentation in a later pass for showcase pages: optional hero artwork, description, presentation/layout settings, theme/accent controls, and potentially tightly scoped custom CSS. Add a true Universe/Franchise semantic entity only if a demonstrated use case cannot be represented by Series, factual relationships, and Shelves.

### 5. Later read and edit surfaces (V2/Future except narrow existing-feature needs)

When a V1 feature needs a minimal Related presentation, render only the groups that feature uses. A later rich Related section can show accessible formats, Series position, adaptations, related Works, and People. Derive formats from identity/representations, People from credits, and semantic sections from the relationship service. Curated Shelf membership may be shown separately, without making it a semantic relationship. Mark holdings, placeholders, and external references distinctly. Hide empty groups.

In a later pass, add a modest authorized editor in metadata/admin surfaces. Search accessible library entities first, then offer explicit placeholder or external-reference creation. Show relationship type, inverse wording, and provenance. Handle deleted targets and authorization changes without broken links.

### 6. Ingest integration and performance gate

Integrate existing People and Series resolution with the relationship authority established here. Add placeholder promotion to ingest when Upcoming, Wishlist, or physical-media work requires it. Keep provider lookups asynchronous and bounded; never materialize every external suggestion as a Work.

Build a synthetic, high-connectivity fixture spanning books, audiobooks, episodes, People, comics, TV, and TTRPG materials. Model a large curated cross-domain Shelf holding 800 Works whose connected metadata spans 140 People and 30 Series; include a Person with 400 credits across six domains and a Work with 25 direct links, 40 credits, Series membership, and Representations. Measure the V1 service's Work Related groups, Person credits, Series context, and TTRPG relationship queries independently of Shelf membership. Shelf showcase and editor-search measurements belong to their later passes. Assert pagination, authorization filtering, stable query counts, and no relationship-to-target N+1 chain. A Work detail request loads only displayed groups; a request for one group must not resolve other groups. Counts use indexed/filtered queries and must not hydrate targets. Set numeric latency/query budgets against the actual local baseline before declaring the pass complete.

Initial budgets for the current Book/Audiobook projection are: semantic group ≤5 SQL statements for a mixed-type page (subject access, count, page, then one target batch per type); People ≤2; Series ≤2; Representations ≤4; and all four requested together ≤11. A 25-link semantic page with `limit=10` has a local API budget of 250 ms. These are ceilings, not targets for additional optimization. The larger Work/Person/Series fixture must verify them before the pass closes.

**Benchmark result (2026-09-16):** the 25-link fixture passed the 250 ms semantic-page budget. Instrumented service calls confirmed semantic projection uses at most five SQL statements and all Related groups use at most eleven. The fixture also verifies bidirectional reads, inaccessible-target filtering, pagination, and independent group selection.

### 7. TTRPG specialization

Use shared identities and relationships for system, edition, setting, adventure, sourcebook, supplement, and campaign context where each concept earns its own model. Keep campaign-specific ordering, sections, resources, and Clubs behavior in TTRPG/Clubs. Register domain predicates such as `uses_system`, `supplement_for`, `set_in`, and `used_by_campaign` only with defined source/target rules and inverses.

## Acceptance gates

- When placeholder promotion is implemented for an existing V1 feature, an incoming EPUB/physical holding promotes an eligible placeholder without creating a duplicate Work or losing user state.
- Removing a Representation leaves the Work, its other Representations, and semantic relationships intact.
- People credits and Series membership have one authoritative write path; provider refresh respects user edits.
- Private or inaccessible targets do not leak through reverse relationships, counts, search, or Person pages.
- The existing `related_edition` Book ↔ Audiobook link resolves in both directions through the shared read model without merging the separate Works.
- Adding or removing a Work from a Shelf does not create, delete, or change its semantic relationships; those relationships resolve when neither Work belongs to any Shelf.
- Related queries remain one hop, group-selective, paginated/bounded, and have stable query counts as result counts grow; counts do not hydrate targets.
- API, authorization, domain, migration, ingest, and important UI tests pass; typecheck, lint, build, desktop/mobile inspection, and documentation are complete for each delivered slice.

## Scope decision

**V1 prerequisite for TTRPG:** inventory existing relationship systems; decide migration and write authority; deliver the shared typed predicate registry/service; preserve `related_edition` Book ↔ Audiobook support; integrate existing People credits and Series membership; enforce library visibility; provide the bounded, group-selective Related read projection; meet query-count/performance gates; and add TTRPG predicates required by campaign resources. TTRPG uses this shared read model from its first implementation slice.

**V1 only where an existing feature requires it:** placeholder identity/promotion infrastructure and minimal Related presentation. Upcoming, Wishlist, or physical-media work may require placeholders independently; TTRPG does not depend on their complete UI.

**V2/Future:** Shelf showcase presentation and landing pages; rich Related UI on every domain; user-facing relationship editor; external-reference discovery; multi-hop exploration; graph visualization. A true Universe/Franchise semantic entity requires a demonstrated use case and is not reserved by this plan.

This subset is recorded in `docs/V1-SCOPE.md`. Keep the dependency pass small enough to proceed directly into TTRPG after its service and performance gates pass.
