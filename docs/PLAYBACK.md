# Playback

Pass 4 establishes shared playback infrastructure for audio. **Pass 9** adds `VideoEngine` for movies (and future TV). Domain UIs integrate in their respective passes.

## Session modes

V1 audiobook playback uses an **ephemeral session** model: the player appears while the user is actively listening, then disappears when they stop, close, or finish (with a brief finished state before auto-dismiss).

| Mode | V1 usage | Behavior |
|------|----------|----------|
| `ephemeral` | Audiobooks, spoken audio | Player visible during active session; **Close/Stop** tears down engine and removes UI |
| `persistent` | Music, Movies (video), TV episodes, Live TV | Mini-player or video overlay remains available across navigation |

**Pause** keeps the ephemeral player open so the user can resume. **Close/Stop** is explicit and distinct from navigation or collapsing the full player.

Future domain integrations may set `sessionMode` on playback items. V1 only implements ephemeral behavior.

## Async session guard

`PlaybackProvider` assigns a monotonically increasing session token when a new playback session starts or when `stopPlayback()` is called. Every async boundary (manifest load, engine callbacks, auto-advance, finished auto-dismiss) verifies the token before mutating state or calling `engine.play()`. Starting another title or stopping invalidates in-flight work from the prior session.

## Three state scopes

| Scope | Owner | Persistence | Pass 4 |
|-------|-------|-------------|--------|
| Personal playback progress | Server (`user_progress`, `user_history`, activity) | Cross-device, user-scoped | Implemented |
| Client-session queue | `PlaybackProvider` | In-memory only (V1 audiobooks) | Implemented |
| Shared / watch-party session | Future layer above `PlaybackProvider` | Ephemeral; not in personal user state | Not implemented |

Watch-party state must never write to `user_progress` or personal `user_history`.

## Security invariant

The client **never constructs file URLs**. All stream sources come from an authorized playback manifest:

`GET /api/v1/representations/:id/playback`

The manifest returns `sources[].url` values such as `/api/v1/files/:id/content`. Clients pass these paths directly to the playback engine.

## Progress model

Listening/watching progress uses a discriminated `PlaybackLocator` stored in `user_progress.locator_json`:

```json
{
  "kind": "playback",
  "positionSeconds": 123.4,
  "durationSeconds": 3600,
  "completed": false
}
```

Reading progress uses `{ "kind": "reading", ... }` and remains independent (V1-SCOPE §22).

### Rules

- **Conflict resolution:** last-write-wins per `(user, subject_type, subject_id)`.
- **Completion:** items at ≥97% duration (or `completed: true`) resume at position 0.
- **Visibility:** backgrounding/tab hiding does **not** auto-pause playback.

Progress sync respects `progressSyncEnabled` from `/api/v1/settings/playback` (shared with reader settings).

## Client architecture

```text
PlaybackProvider (local state only)
  ├── PlaybackEngine interface
  │     ├── AudioEngine (Pass 4)
  │     └── VideoEngine (Pass 9 — shared, not movie-specific)
  ├── engine-neutral PlaybackState
  ├── debounced progress sync
  └── Media Session API bindings
```

### `PlaybackEngine` contract

- `load(sources)` — sources from manifest only
- `play()` / `pause()` / `seek(positionSeconds)`
- `getPosition()` / `getDuration()`
- `setVolume()` / `getVolume()`
- `onStateChange()` / `destroy()`

### Engine-neutral `PlaybackState`

- `status`, `currentItem`, `positionSeconds`, `durationSeconds`, `queue`, `queueIndex`, `error`
- No audio/video-specific fields in provider state

### VideoEngine (Pass 9–10)

- Implements `PlaybackEngine` using an HTML `<video>` element
- Library video streams via authorized manifest URLs (HTTP range requests)
- **TV episodes** use `GET /api/v1/tv/episodes/:id/playback`; progress on `subjectType = tv_episode`
- **Live TV** uses `GET /api/v1/tv/live/channels/:id/playback` with external stream URLs (auth-gated manifest only); no progress sync
- **HLS:** native HLS preferred (Safari); `hls.js` fallback for `.m3u8` where native playback is unavailable
- `VideoPlayer` overlay provides play/pause, seek, and close
- Browser baseline for library files: H.264/AAC in MP4

## Server module

`src/server/modules/playback/`

- **PlaybackService** — access resolution, manifest, progress, history
- **MediaDomainProcessor registry** — extension point for `media.process` jobs

Concrete domain processors (e.g. audiobook duration probing) register in later domain passes.

## Validation

Admin/dev route: `/dev/playback`

Enter a representation ID to fetch a manifest and exercise the full stack before domain UIs exist.

## Related docs

- [API.md](./API.md) — playback endpoints
- [ARCHITECTURE.md](./ARCHITECTURE.md) — module boundaries
- [READER.md](./READER.md) — EPUB reading (separate from standalone playback)
