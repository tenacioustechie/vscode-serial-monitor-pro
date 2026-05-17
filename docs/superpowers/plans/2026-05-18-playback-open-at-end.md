# Playback Open-at-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the Playback panel with the cursor positioned at the end of the session so the full serial log is rendered up front and the user can tell at a glance whether they opened the right session.

**Architecture:** A new pure helper `initialCursorMs(session)` in `media/playback-core.js` returns `session.duration` for positive durations and `0` otherwise. `media/playback.js` `initializePlayback()` calls `seekTo(PlaybackCore.initialCursorMs(session))` once everything is wired up, reusing the existing seek code path to update the cursor, audio time, output rendering, and next-event index in one call.

**Tech Stack:** Plain JS (`media/`), `node:test` for unit tests, esbuild for the extension-host bundle (not involved here), VS Code webview.

---

## File Structure

**Modified:**

- `media/playback-core.js` — add `initialCursorMs` function and export it through the existing `PlaybackCore` UMD object.
- `media/playback.js` — last line of `initializePlayback()` becomes `seekTo(window.PlaybackCore.initialCursorMs(session));`.
- `tests/playback-core.test.mjs` — new tests for `initialCursorMs`.
- `package.json` — version `0.5.0` → `0.7.0`.
- `CHANGELOG.md` — new `0.7.0` entry at the top.
- `docs-site/docs/project/changelog.md` — mirror of the CHANGELOG entry.
- `docs-site/docs/features/playback.md` — one-line note under "Opening a Session".

**New:**

- None.

---

## Task 1 — Add `initialCursorMs` to playback-core

**Files:**
- Modify: `media/playback-core.js`
- Test: `tests/playback-core.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append the following tests to `tests/playback-core.test.mjs` (after the existing `isAtEnd` tests). The destructure on line 9 must also be updated to import the new function:

Change line 9 from:

```js
const { isAtEnd } = require(path.join(here, '..', 'media', 'playback-core.js'));
```

to:

```js
const { isAtEnd, initialCursorMs } = require(path.join(here, '..', 'media', 'playback-core.js'));
```

Then append at the bottom of the file:

```js
test('initialCursorMs: returns the duration when positive', () => {
  assert.equal(initialCursorMs({ duration: 5000 }), 5000);
});

test('initialCursorMs: returns 0 when duration is 0', () => {
  assert.equal(initialCursorMs({ duration: 0 }), 0);
});

test('initialCursorMs: returns 0 when duration is missing', () => {
  assert.equal(initialCursorMs({}), 0);
});

test('initialCursorMs: returns 0 when duration is null', () => {
  assert.equal(initialCursorMs({ duration: null }), 0);
});

test('initialCursorMs: returns 0 when duration is NaN', () => {
  assert.equal(initialCursorMs({ duration: NaN }), 0);
});

test('initialCursorMs: returns 0 when duration is negative', () => {
  assert.equal(initialCursorMs({ duration: -1 }), 0);
});

test('initialCursorMs: returns 0 when session is null', () => {
  assert.equal(initialCursorMs(null), 0);
});

test('initialCursorMs: returns 0 when session is undefined', () => {
  assert.equal(initialCursorMs(undefined), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/brian/codeme/vscode-serial-monitor-plus
node --test tests/playback-core.test.mjs
```

Expected: tests fail with `TypeError: initialCursorMs is not a function` (or similar — the import comes back undefined because the export does not yet exist).

- [ ] **Step 3: Implement the helper**

Edit `media/playback-core.js`. Replace the entire file with:

```js
// Pure playback helpers, shared between the webview script and Node tests.
(function (root) {
  'use strict';

  function isAtEnd(currentTimeMs, duration) {
    if (typeof duration !== 'number' || duration <= 0) { return false; }
    return currentTimeMs >= duration;
  }

  function initialCursorMs(session) {
    if (!session) { return 0; }
    const d = session.duration;
    return typeof d === 'number' && isFinite(d) && d > 0 ? d : 0;
  }

  const PlaybackCore = { isAtEnd: isAtEnd, initialCursorMs: initialCursorMs };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlaybackCore;
  } else {
    root.PlaybackCore = PlaybackCore;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

`isFinite(d)` covers the NaN case explicitly (NaN > 0 is `false`, but being defensive about non-finite numbers matches the spirit of the existing `isAtEnd` guards).

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/playback-core.test.mjs
```

Expected: all `initialCursorMs` tests pass, all existing `isAtEnd` tests still pass.

- [ ] **Step 5: Commit**

```bash
git add media/playback-core.js tests/playback-core.test.mjs
git commit -m "feat(playback-core): add initialCursorMs helper

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2 — Wire `initialCursorMs` into `initializePlayback`

**Files:**
- Modify: `media/playback.js`

- [ ] **Step 1: Add the seekTo call at the end of initializePlayback**

In `media/playback.js`, find the existing `initializePlayback` function (it currently ends with `updateOutputDisplay();`). Replace this block:

```js
    // Render markers
    renderMarkers();

    // Render empty output state
    updateOutputDisplay();
  }
```

with:

```js
    // Render markers
    renderMarkers();

    // Render empty output state
    updateOutputDisplay();

    // Land the cursor at the end so the full session log is visible at a glance.
    seekTo(window.PlaybackCore.initialCursorMs(session));
  }
```

`seekTo` (defined later in the same file) clamps to `[0, session.duration]`, syncs `audioPlayer.currentTime`, advances `nextEventIndex`, and re-runs `updateOutputDisplay()` — so this single call updates every UI piece consistently.

- [ ] **Step 2: Manual smoke (extension host)**

This must be verified in the Extension Development Host because the change is webview-only and there is no DOM test harness. The build step is not strictly required (media files are not bundled), but run it anyway to be safe:

```bash
npm run build
```

Then press F5 in VS Code to launch the Extension Development Host. Open any existing recorded session from the **Recorded Sessions** sidebar and confirm:

- Time readout shows `MM:SS / MM:SS` (e.g. `00:42 / 00:42`) — not `00:00 / 00:42`.
- The output area is fully populated with the session's events on first paint.
- The timeline cursor is at the right edge of the timeline.
- If the session has audio, the audio player is positioned at the end (its scrubber sits at the right).
- Pressing **Play** rewinds to `00:00` and starts playback (existing v0.5.0 behavior — sanity check that it still works).
- Pressing the existing **Skip Back / Skip Forward** buttons works the same as before.
- Opening a session with `duration === 0` (if one exists; otherwise N/A) opens at `00:00 / 00:00` with empty output — no regression.

- [ ] **Step 3: Commit**

```bash
git add media/playback.js
git commit -m "feat(playback): open at end of timeline

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3 — Bump version to 0.7.0

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump the version**

In `package.json`, change `"version": "0.5.0"` to `"version": "0.7.0"`. This branch is based on `main` (v0.5.0); v0.6.0 (PR #18) will merge separately. If v0.6.0 lands first, the CHANGELOG ordering will need a small merge-time fix; the version field itself is correct as `0.7.0`.

- [ ] **Step 2: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))" && echo OK
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(0.7.0): bump version

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4 — Update documentation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs-site/docs/project/changelog.md`
- Modify: `docs-site/docs/features/playback.md`

- [ ] **Step 1: Update CHANGELOG.md**

Insert a new section at the top of `CHANGELOG.md`, immediately above the `## [0.5.0]` heading (or above `## [0.6.0]` if PR #18 has already merged):

```markdown
## [0.7.0] — 2026-05-18

When you open a recorded session, the playback panel now lands at the **end** of the timeline so the full serial log is rendered up front. This lets you tell at a glance whether you opened the right session — no need to scrub or press Play just to check. Hitting **Play** still rewinds to `00:00` and plays from the start, courtesy of the existing v0.5.0 end-of-session detection.

### Changed

- **Playback opens at the end of the timeline.** Previously, opening a session left the cursor at `00:00` and the output area empty until you pressed Play or scrubbed. The cursor now lands at `session.duration` on open, so every event up to the end is already visible. Sessions with `duration === 0` or missing duration still open at `00:00` (no regression).

### Internal

- New pure helper `initialCursorMs(session)` lives in `media/playback-core.js` next to the existing `isAtEnd` helper, matching the established UMD + `node:test` pattern. Unit-tested in `tests/playback-core.test.mjs` for positive, zero, missing, null, NaN, and negative durations.
```

- [ ] **Step 2: Mirror to docs-site changelog**

Apply the exact same Markdown block to the top of `docs-site/docs/project/changelog.md`, immediately above the same heading.

- [ ] **Step 3: Update docs-site playback page**

In `docs-site/docs/features/playback.md`, find the "Opening a Session" section:

```markdown
## Opening a Session

1. Find the session in the **Recorded Sessions** sidebar panel.
2. Click it to open the playback panel.
```

…and append a paragraph immediately after step 2:

```markdown

The playback panel opens with the cursor at the **end** of the timeline so the full serial log is already rendered when the panel appears. Pressing **Play** rewinds to `00:00` and plays from the beginning, so you don't need to seek back manually before replaying.
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md docs-site/docs/project/changelog.md docs-site/docs/features/playback.md
git commit -m "docs: changelog + docs-site entries for v0.7.0 playback open-at-end

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5 — Final verification

**Files:**
- (No code changes — verification only.)

- [ ] **Step 1: Run the full test suite**

```bash
cd /Users/brian/codeme/vscode-serial-monitor-plus
npm test
```

Expected: all tests pass. The previous baseline is 33 tests; this branch adds 8 new `initialCursorMs` tests, so 41/41 should pass.

- [ ] **Step 2: Run the linter**

```bash
npm run lint
```

Expected: no errors. (This branch does not touch any TypeScript file, but lint covers `src/**/*.ts` so it should run clean either way.)

- [ ] **Step 3: Run a production build**

```bash
npm run build
```

Expected: build succeeds. Media files are not bundled by esbuild — this is mostly a smoke check on the wider toolchain.

- [ ] **Step 4: Run the packaging integration test**

```bash
npm run package:verify
```

Expected: `vsce package` succeeds and the integration test passes. Verifies the new media changes ship cleanly inside the `.vsix`.

- [ ] **Step 5: Final manual smoke (repeat from Task 2 Step 2 if you skipped it)**

Press F5 → Extension Development Host. Open any recorded session and confirm the cursor lands at the end, the output is fully populated, and pressing Play rewinds and replays correctly.

- [ ] **Step 6: Push the branch**

```bash
git push -u origin openatend
```

(Only if the user asks for a PR. Otherwise leave the branch local.)

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Cursor lands at `session.duration` on open | Task 2 |
| Output area shows full session log on open | Task 2 (via `seekTo` → `updateOutputDisplay`) |
| Audio cursor positioned at end | Task 2 (via `seekTo` → `audioPlayer.currentTime`) |
| Press Play after open rewinds and plays from 0 | Existing v0.5.0 behavior, verified in Task 2 Step 2 |
| Pure helper `initialCursorMs` in playback-core.js | Task 1 |
| `initialCursorMs` returns 0 for zero / missing / NaN / negative duration | Task 1 |
| Unit tests for the helper | Task 1 |
| Version bumped to 0.7.0 | Task 3 |
| CHANGELOG + docs-site updates | Task 4 |
| No new settings, no migration | Naturally satisfied — no settings touched |

No gaps identified.

---

## Type consistency self-check

- `PlaybackCore.initialCursorMs(session)` is the only new API surface; it is referenced consistently in Task 1 (export), Task 2 (call site), and the spec.
- `seekTo(ms)` is the existing function in `media/playback.js`; both occurrences in this plan match its existing signature.
- `session.duration` is the existing field on `RecordingSession`; no new schema additions.
