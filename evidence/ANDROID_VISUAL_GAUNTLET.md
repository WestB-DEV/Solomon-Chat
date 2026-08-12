# Solomon Chat Android Visual Gauntlet

## Contract

- Every revision is built as a production artifact, hashed, installed into the Android 15 emulator, and inspected inside Obsidian 1.13.6.
- Gboard must be visible for keyboard checks; host-keyboard-only evidence does not count.
- Browser-sized harnesses supplement deterministic tests but never substitute for Android evidence.
- Each round receives an independent critic verdict against the approved mobile matrix.

## Round log

### Round 1 — `1.1.0-beta.2`

- Builder target: measure Obsidian's floating `.mobile-navbar` even though it ends above Android's gesture inset.
- Artifact SHA-256: `b2619978b9081029cfdca18fa23eb0296df1a2b326970d14b5bc658939dd2dbd`.
- Commit: `9c531ba07070cf5bd7cd852f832d658eda2f131a`.
- Deterministic checks: lint (one existing warning), 23 tests, typecheck, and production build passed.
- Android result: portrait keyboard closed/open passed and the draft survived rotation, but landscape keyboard-open did not.
- Independent critic: **FAIL — P1.** The speaker selector, attachment, and send controls were occluded by Gboard in `round-1-landscape-keyboard-open.png`.

### Round 2 — `1.1.0-beta.3`

- Builder target: consume Obsidian's native Capacitor keyboard-height event and keep the entire compact composer above Gboard in landscape.
- Artifact SHA-256: `8d6b6c0aafbb52e950d3376e26d8583dd8e5f9e501207a0cbc5afd0c4a1d596f`.
- Commit: `825582473d7708650f0236e24bb785f639de9c1f`.
- Deterministic checks: lint (zero errors, one pre-existing settings-search warning), 23 tests, typecheck, and production build passed.
- Exact revision verified inside Obsidian: manifest reports `1.1.0-beta.3`; staged `main.js`, `manifest.json`, and `styles.css` were hashed on-device.
- Android matrix: portrait and landscape keyboard open/closed passed; actual Gboard remained visible; a long draft survived dismissal, reopening, and rotation; composer, speaker, attachment, and send controls remained visible and reachable; composer/nav overlap measured zero; composer-center hit testing resolved to Solomon rather than the underlying navbar.
- Interaction checks: the long draft sent as `Me` with a stable message ID; the synthetic attachment picker opened, `attachment-fixture.txt` was selected, and the link sent as `Wise Friend` with a stable message ID.
- Independent critic: **FAIL — P1.** After returning from the native attachment picker, Obsidian's upper-left floating navigation control overlapped the speaker selector in `round-2-attachment-selected.png`.

### Round 3 — `1.1.0-beta.4`

- Builder target: reserve the floating upper-left/right control zones in portrait keyboard-open mode while retaining the compact full-width landscape row.
- Android result: portrait speaker control no longer overlapped the floating navigation after attachment return. Landscape with an attachment selected exposed a new P1: the full-width attachment tray wrapped the text and action row below Gboard.

### Round 4 — `1.1.0-beta.5`

- Builder target: keep the selected-attachment tray compact and inline in landscape keyboard-open mode so every control remains above Gboard.
- Artifact SHA-256: `e04f7ac7e29c8e000371def3e65df1b86bc8995fa02256d1ef07244e96741d06`.
- Commit: `33b1adc90058a31d325f24020e761fa09c88f1c0`.
- Deterministic checks: lint (zero errors, one pre-existing settings-search warning), 23 tests, typecheck, and production build passed.
- Android result: landscape attachment keyboard-open passed, and exact beta.5 persistence/attribution passed.
- Independent critic: **FAIL — P1.** Portrait keyboard-open squeezed the no-attachment textarea into an unusably narrow column.

### Round 5 — `1.1.0-beta.6`

- Builder target: place the portrait keyboard-open speaker selector on its own row, preserving a usable textarea width while avoiding Obsidian's floating control.
- Artifact SHA-256: `eab6210f117655acb271e0ba7a10f02592e19fa02a5a1791a60f157444f14492`.
- Commit: `dcd57f92c4fbf7e8cce66fd8d1d53b0810814c09`.
- Deterministic checks: lint (zero errors, one pre-existing settings-search warning), 23 tests, typecheck, and production build passed.
- Android result: **FAIL — P1.** Exact beta.6 still gave the speaker selector most of the first flex row, leaving the textarea only a few characters wide in portrait with Gboard open.

### Round 6 — `1.1.0-beta.7`

- Builder target: use an explicit portrait keyboard-open grid with the speaker selector on row one and a full-width input/action row below it; retain the proven compact landscape flex row.
- Android result: portrait Gboard open/dismiss/reopen and long-draft usability passed; rotation to landscape retained all controls; attachment return passed in landscape and portrait; the sent message preserved the selected `Wise Friend` attribution, stable message ID, and durable attachment Markdown.
- Status: candidate passed the observed Android matrix; one platform-neutral container-observation refinement proceeds as beta.8 before final critique.

### Round 7 — `1.1.0-beta.8`

- Builder target: observe Obsidian's actual content host for size changes so the bounded plugin shell recomputes from container and VisualViewport geometry on both Android and iOS.
- Cross-platform architecture: the leaf owns a `min-height: 0; overflow: hidden` grid; only the transcript scrolls; the composer remains in normal flow. VisualViewport `resize` and `scroll` drive the universal visible-rectangle calculation. Safe-area values are applied once at the shell. Capacitor keyboard height remains an isolated mobile-host fallback when the embedded Android WebView does not expose the keyboard shrink through VisualViewport; there are no fixed keyboard offsets.
- Status: implementation in progress.
