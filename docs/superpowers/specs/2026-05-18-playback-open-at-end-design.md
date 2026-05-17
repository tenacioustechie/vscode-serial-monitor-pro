# Playback: Open at End — Design

**Date:** 2026-05-18
**Target release:** v0.7.0
**Branch:** `openatend` (branched from `main`)
**Status:** Approved — implementation pending

## Problem

When a user opens a recorded session from the **Recorded Sessions** sidebar, the Playback panel starts at `currentTimeMs = 0` and the output area is empty. To figure out whether they opened the right session, the user has to scrub the timeline or press Play — neither of which is a low-friction "let me peek at what's in here" gesture.

The most informative content in any session is usually the last few seconds of serial output. Landing the cursor at the end of the timeline means the entire session's output is already rendered into the panel the moment it opens, and the user can tell at a glance whether it's the session they want to review.

## Goals

- The Playback panel opens with its cursor at the end of the session (`session.duration`).
- The output area shows every event up to (and including) the end.
- The audio cursor, if audio exists, is positioned at the end.
- The time display reads `MM:SS / MM:SS`.
- No new settings, no new UI — the change is invisible until you open a session.

## Non-goals

- Auto-playing on open. The cursor lands at the end; pressing Play follows existing behavior.
- Making "open at end" configurable. YAGNI for now; can be added if a user asks.
- Changing behavior for sessions opened with an explicit start position (no such code path exists).

## User experience

- User clicks a session in **Recorded Sessions** (or runs `serialMonitorPro.openPlayback`).
- Playback panel opens. The output area is already populated with the full session log, the timeline cursor is at the right edge, and the time readout shows e.g. `00:42 / 00:42`.
- If the user clicks **Play**, the existing v0.5.0 fix detects the end-of-session state and seeks to `0` before resuming — so Play "starts over" exactly as it did before.

## Architecture

This is a **one-line behavior change** in the playback webview. The mechanics already exist:

- `seekTo(ms)` in [media/playback.js](media/playback.js) is the single source of truth for positioning the cursor. It clamps to `[0, session.duration]`, syncs `audioPlayer.currentTime`, updates `nextEventIndex`, and triggers `updateOutputDisplay()`.
- `initializePlayback()` already calls `updateOutputDisplay()` at the end — the only thing missing is a `seekTo(session.duration)` immediately before it.

To keep the rule testable without DOM, the duration-to-cursor decision is extracted into a tiny pure helper in [media/playback-core.js](media/playback-core.js):

```js
function initialCursorMs(session) {
  if (!session) return 0;
  const d = session.duration;
  return typeof d === 'number' && d > 0 ? d : 0;
}
```

`media/playback.js` then calls:

```js
seekTo(window.PlaybackCore.initialCursorMs(session));
```

at the end of `initializePlayback()`.

### Why the helper

It would be perfectly correct to inline `seekTo(session.duration || 0)`. Extracting `initialCursorMs` buys two things:

1. The rule (what counts as "the end" — and the fallback when there's no duration) lives in one place that any future feature (e.g. "remember last position") can reuse.
2. It matches the existing pattern from v0.3.0 / v0.5.0 (`computePeaks`, `isAtEnd`) where small playback rules are extracted from `playback.js` into `playback-core.js` and unit-tested via `node:test`.

## Edge cases

| Case | Behavior |
|---|---|
| `session.duration === 0` (empty session) | `initialCursorMs` returns 0. Cursor at 0. Existing behavior — no regression. |
| `session.duration` missing/undefined | `initialCursorMs` returns 0. Same as above. |
| `session.duration` is negative or NaN | Treated as falsy by `typeof === 'number' && d > 0` — returns 0. Defensive. |
| Session has audio | `seekTo` already sets `audioPlayer.currentTime = duration / 1000`. HTMLAudioElement clamps seek-past-end values, so audio is paused at the end. |
| User clicks Play after open | Existing fix in `media/playback.js` (lines around 235) detects end-of-session via `PlaybackCore.isAtEnd` and seeks to 0 before resuming. |
| User scrubs the timeline | Untouched. `seekTo` is the same code path. |
| User opens a session that's still being recorded | Out of scope — no such code path exists. Recording sessions are only saved on stop. |

## Testing

- Unit tests in `tests/playback-core.test.mjs` cover `initialCursorMs`:
  - Returns `session.duration` for a positive duration.
  - Returns `0` for `duration === 0`.
  - Returns `0` for `duration` undefined.
  - Returns `0` when called with `null` session.

- The DOM-side wiring (`initializePlayback` calling `seekTo` with the helper's value) is not unit-tested, matching the established pattern — the same is true of v0.3.0's waveform attachment and v0.5.0's end-of-session play fix. Manual smoke covers it.

## Files changed

**Modified:**

- `media/playback.js` — one new line at the end of `initializePlayback()`.
- `media/playback-core.js` — add the `initialCursorMs` export (UMD pattern, matches `isAtEnd`).
- `tests/playback-core.test.mjs` — four new tests.
- `package.json` — version bump `0.5.0` → `0.7.0`.
- `CHANGELOG.md` — `0.7.0` entry.
- `docs-site/docs/project/changelog.md` — mirror.
- `docs-site/docs/features/playback.md` — one-line note about the open-at-end default.

**New:**

- `docs/superpowers/specs/2026-05-18-playback-open-at-end-design.md` (this file).
- `docs/superpowers/plans/2026-05-18-playback-open-at-end.md` (forthcoming).

## Rollout

- Version: `0.7.0`. Branched from `main` (currently at v0.5.0). When PR #18 (v0.6.0) merges first, the CHANGELOG will need a small merge resolution to position `0.6.0` between `0.7.0` and `0.5.0` — trivial.
- No setting, no migration, no data on disk affected.

## GitHub issue (text supplied to user)

**Title:** Open playback at end of timeline so users can see the session's last output at a glance

**Description:**

When a recorded session is opened from the **Recorded Sessions** sidebar, the Playback panel currently starts at `00:00` with an empty output area. To figure out whether a session is the one you actually want to review, you have to scrub the timeline or press Play.

Land the cursor at the end of the timeline on open so the entire session's serial output is already rendered into the panel. Pressing Play after open is unchanged — the existing "Play at end rewinds to 0" behavior takes over.

**Acceptance criteria:**

- Opening any session lands the cursor at `session.duration` (or `0` if duration is missing or zero).
- Output area shows the full session's events on open.
- Audio cursor (if audio exists) is positioned at the end.
- Pressing Play after open seeks to 0 and starts playback from the beginning (existing v0.5.0 behavior).
- `tests/playback-core.test.mjs` includes a new `initialCursorMs` test suite.

**Closure message:**

Shipped in v0.7.0. The Playback panel now opens at the end of the timeline so the full session log is visible at a glance. Pressing Play still rewinds and plays from the beginning, courtesy of the existing v0.5.0 end-of-session detection.
