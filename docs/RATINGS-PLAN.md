# Ratings flow

Updated 2026-09-14.

The book rating modal has five steps: **Core Rating → Genre Ratings → Trajectory + Recommendation → Suggested Rating → Review + Post/Save**.

Trajectory is selected directly on a graph, with rating on the vertical axis and 25%, 50%, 75%, and 100% along the horizontal axis. Clicking or tapping chooses a score at that stage; selecting the same point clears it. The configured scale and half-star setting apply. Every point is keyboard accessible and announces its rating, progress, and selected state. There are no milestone or progress entry fields.

Short Summary is removed. The written review remains in the final step.

Edits stay in memory while the modal is open. Back and Next do not persist drafts. The suggestion is calculated from current inputs using the shared calculator. Closing with unsaved changes asks whether to discard them; reopening loads the last saved rating. Save rating submits all values in one request and one database transaction. Failed saves preserve the open form. External posting remains a separate explicit action after saving.

The existing draft endpoint and storage types remain for compatibility; the modal no longer uses them. The finalization endpoint accepts the complete rating and commits a completed review atomically. Authorization and user scoping remain unchanged.

Verification: ratings calculation, service, and API tests pass (37 tests), targeted ESLint passes, and the Edge browser fixture checks navigation without saves, graph selection, save failure/retry, external posting, focus, and desktop/mobile layouts. Project type checking still fails in unrelated OIDC, metadata, and test files.

## Genre vocabulary ownership

Updated 2026-09-14.

Metadata Formatting is the source of truth for genre identity. A genre term owns its canonical name, generated slug, single parent, aliases, media applicability, enabled state, and optional sort order. Ratings references genre term IDs and attaches media-specific rubric behavior; it does not maintain a second genre list.

Fresh installs receive the production default genre vocabulary, including Romantasy and Epic Fantasy under Fantasy, Space Opera and Alternate History under Science Fiction, and Cozy Mystery under Mystery. Romantasy resolves Romantic Fantasy and Fantasy Romance aliases. Science Fiction resolves Sci-Fi, Sci Fi, and SF. Genre and tag defaults seed independently and idempotently, including partially seeded databases.

Book rating definitions are unique by genre term and media type. A definition has an explicit `custom` or `inherit` mode. Resolution begins with each assigned canonical genre, accepts canonical names or aliases, ignores disabled and non-book-applicable terms, and walks toward the parent until it finds an enabled custom rubric. This preserves the existing book review API while making the configuration model reusable by later media-specific rating flows.

Metadata Formatting provides the full hierarchy editor, including aliases, parent, applicability, status, sort order, searching, and media filtering. Ratings consumes that tree. Its default Books view includes configured genres and children that inherit configured parent criteria, with search and a Show all genres control. A genre referenced by a rating definition cannot be deleted until that configuration is removed.

Migration `0034_genre_vocabulary_ratings.sql` backfills stable slugs and Books media type for existing data, changes rating-definition uniqueness to genre plus media type, and changes genre deletion to dependency-protected `restrict` behavior.

