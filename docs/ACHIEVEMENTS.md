# Achievements 1.0

Achievements are earned accomplishments owned by Feylore features. A
definition describes what can be earned; a grant records that a user earned
it. Definitions are created through the feature that owns them — Goals own
their `completed` achievement today; Challenges and Clubs register their own
sources later. There is intentionally no global admin achievement-definition
panel and no manual granting UI.

Related scope: [V1-SCOPE.md](V1-SCOPE.md) § "Goals and rule-driven tracking"
and § "Achievements". Read endpoints: [API.md](API.md) § "Achievements".

## Model

`achievement_definitions` — what can be earned:

- `id`, stable `key` (lowercase alphanumeric with dashes/underscores),
  `name`, `description`, optional Solar `icon`, optional `presentation`
  metadata
- `source_type` + `source_id`: the intentionally generic owning-feature
  relationship (`challenge` | `club` | `goal` | `system` today)
- `source_label`: cached human-readable source label, maintained by the
  owning feature (e.g. updated on goal rename)
- `created_by_user_id` (nullable, `set null`), `created_at`, `updated_at`
- `state`: `active` | `archived`
- Unique `(source_type, source_id, key)`: one definition per key per source

`user_achievements` — the actual earned accomplishment:

- `user_id`, `achievement_definition_id` (`restrict`: definitions are
  archived, never destructively deleted while grants exist), `earned_at`
- `source_type`, `source_id`, `source_label`: immutable provenance context
- `reason_type`, `reason_id`, `reason_label`: why it was earned
  (e.g. `goal.completed`)
- `snapshot`: compact immutable grant snapshot (achievement name/icon plus
  source label) so the grant stays understandable after renames or deletes
- `metadata`: opaque feature context for historical meaning
- Unique `(user_id, achievement_definition_id)`: default is one grant per
  user per definition. No repeatable achievements in 1.0.

Migration: `drizzle/0051_achievements.sql`.

## Service boundary

`AchievementService` (`src/server/modules/achievements/service.ts`) is the
only writer. Feature modules never insert grants directly.

Definitions (feature-owned management, requires the owning source's guard):

- `defineAchievement(actor, input)`
- `updateAchievementDefinition(actor, definitionId, input)`
- `archiveAchievement(actor, definitionId)` / `restoreAchievement(actor, definitionId)`

Grants (called by the owning feature with a reason/source reference):

- `grantAchievement({ source, definitionKey, recipientId, reason?, metadata?, actorUserId?, earnedAt? })`
  → `{ grant, created }`. Idempotent: the unique grant index plus
  `ON CONFLICT DO NOTHING` means reprocessing a completion event returns the
  existing grant with `created: false`. Archived (or missing) definitions
  stop granting with `NotFoundError`; existing grants are preserved.

Reads:

- `getAchievement(definitionId)`, `getSourceAchievements(type, id)`
- `hasAchievement(userId, definitionId)`
- `listUserGrants`, `recentUserGrants`, `countUserGrants`,
  `getUserGrantForDefinition` — all take a viewer context and apply the
  profile gate plus per-grant source-visibility filtering (see Privacy).

## Source ownership

Each source type registers an `AchievementSourceGuard`:

- `assertCanManage(actor, sourceId)` — who may define/manage achievements
  for this source (goal owner; system administrators; future: challenge or
  club organizers)
- `resolveSourceLabel(sourceId)` — current label, or `null` when gone
- `canViewerSeeSource(viewer, sourceId)` — whether the viewer may learn
  about this source's existence. This is where "a Club achievement must
  never expose membership in a private Club" is enforced once Clubs own
  achievements.

Registered today: `system` (administered, instance-visible) and `goal`
(owner-managed; visible to the owner, or to `goals.read` holders when the
goal is public). Grant issuance itself is trusted server-side feature code:
the calling module owns its issuance rules and passes a source/reason
reference — never arbitrary UI-authored achievement state. The guard lookup
(`getSourceGuard`) is exposed so future grant surfaces can apply issuance
checks before calling the service.

## Provenance

A grant answers "Earned X / From Y / On Z" forever:

- `source_label` + `snapshot` are captured at grant time from the guard's
  current label
- Grant presentation prefers the snapshot; the live definition is only a
  fallback. Renames change future grants, never history.
- Deleting the source (e.g. goal deleted) archives its definitions
  (`archiveDefinitionsForSource`); grants remain readable by the recipient
  with their snapshot intact.

## Privacy and permissions

Achievements belong to the recipient.

- Define/grant authority comes from the source feature (ownership checks),
  not from a global achievement permission.
- View authority comes from profile/privacy rules: the recipient always
  sees their own grants; other viewers must pass the profile gate
  (`canViewProfileAsync`) AND every grant's `canViewerSeeSource`. Grants
  from invisible sources are excluded from lists, counts, single-grant
  lookups, and profile views — never leaked by omission or by count.
- `achievement.earned` activity rows use the recipient's default activity
  visibility; `private` activity never leaks (existing activity rules).

## Module control

Achievements and Challenges are registered feature modules
(`src/shared/feature-modules.ts`) and appear under
Admin → Library → Modules with instance-wide enable/disable. Media
(metadata) module configuration is stored separately and untouched.

- Disabled: `define*` / `grant*` throw `ForbiddenError`; read endpoints and
  the profile `recentAchievements` surface return 404 / `[]`.
- Stored definitions and grants are retained; re-enabling restores the
  feature with no data loss.
- Reserved for later: retention/visibility policy, module statistics,
  maintenance/rebuild operations, and destructive wipe actions with strong
  confirmation. Admin controls the feature's existence and policy; users and
  clubs create the content.

## Activity and notifications

A successful new grant (`created: true`) emits both integration points:

- Activity: `achievement.earned` row (`subjectType: "achievement"`,
  `subjectId: <definitionId>`) with IDs and safe structured context in the
  payload.
- Domain event: `achievement.earned` with `{ grantId, definitionId,
definitionKey, recipientUserId, reasonType, reasonId, source: { type, id,
label }, achievement: { name, icon }, earnedAt }` — structured context,
  never pre-rendered notification copy.
- `AchievementEarnedSource` renders the event into the recipient's
  `achievement.earned` notification (deduped per grant). Awarding features
  never announce achievements themselves.

## Goals integration (first owning feature)

`GoalService` bridges Goals and Achievements:

- Goal created → defines the goal's `completed` achievement (same title,
  description, icon) via `defineAchievement` as the owner.
- Progress evaluates to completed → grants `completed` to the goal owner
  with reason `goal.completed` (idempotent; no-op for drafts and for goals
  without an active definition).
- Goal renamed → refreshes the definitions' `source_label`.
- Goal deleted → archives its definitions; grants survive.

Every goal therefore earns exactly one achievement on completion. Challenge
achievements will follow the same pattern through the Challenge service
once Challenges exist — challenge-specific concepts (bingo, blackout,
deadlines, objectives, participation) stay out of this module.

## Profile and API foundation

Profile Experience consumes `recentAchievements` on the viewer profile view
plus the `/achievements/me*` and `/profiles/:username/achievements*`
endpoints (recent, paginated all, count, single grant of a definition).
Dedicated history/showcase UI comes later; the profile shows a simple
Recent Achievements section.

## Explicitly deferred

No points/gamerscore, rarity, tiers, global catalog, admin creator, manual
granting UI, leaderboards, repeatable achievements, trading, badge
cosmetics, challenge mechanics, or top-level nav item.

## Invariants (covered by `tests/achievements.test.ts`)

- Reprocessing a completion event never duplicates a grant or its
  activity/event side effects.
- Non-owners cannot define/update/archive another source's definitions.
- Archived definitions stop granting; grants survive rename and delete.
- Invisible sources are excluded from every viewer-facing read, including
  counts.
- Disabling the module stops processing and hides surfaces without data loss.
