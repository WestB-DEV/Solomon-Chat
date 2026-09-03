# Solomon Chat Mobile Implementation Plan

Source audit: `MOBILE_UX_AUDIT.md` at commit `64119b1827e6518635b2ec31f68078a69a80668f`.

## Outcome and beta boundary

The mobile beta is accepted only when a user can create/open a conversation, understand and switch the active speaker, write or restore a long draft, send exactly once as the correct speaker, navigate a long transcript, edit/delete safely, and attach a normal photo/document on one physical iPhone and one physical Android without overlap, data loss, duplicate messages, or inaccessible controls.

Not in the first beta:

- AI-generated answers or network services
- A full standalone conversation database
- Cross-vault cloud synchronization beyond Obsidian's existing file model
- Elaborate animations or platform imitation
- A new discovery/home view unless the core workflow passes first

## Delivery sequence

### Checkpoint 0 — Reproducible baseline

Files:

- `package.json`
- `TESTING.md`
- `tests/mobile-harness.*`
- new `tests/fixtures/` and test evidence log

Work:

1. Provision the documented Node/npm version and run `npm ci && npm run check` without source changes.
2. Record exact Node, npm, OS, Obsidian, iOS/Android, plugin, and WebView versions.
3. Add a checked-in test-results template; do not commit generated videos or personal vault data.
4. Establish a dedicated synthetic test vault, as Obsidian's official docs recommend.

Gate:

- Existing check suite passes from a clean clone.
- Current physical-device behavior is recorded before changes.

### Checkpoint 1 — Reliability transaction and durable drafts (P0)

Files:

- `src/plugin.ts`: orchestrate but remove persistence details.
- new `src/drafts.ts`: versioned, debounced draft persistence keyed by stable conversation identity.
- new `src/operations.ts` or `src/repository.ts`: idempotent send/edit/delete operations.
- `src/model.ts`: stable backward-compatible message identity and transformations.
- new `tests/drafts.test.ts`, `tests/operations.test.ts`, additions to `tests/model.test.ts`.

Work:

1. Add a stable conversation ID to new notes; migrate lazily without breaking readable Markdown.
2. Add stable IDs to new messages while continuing to parse legacy `[left/right, timestamp]` blocks.
3. Replace index-targeted mutation with ID/fingerprint-targeted mutation.
4. Make send idempotent and recoverable across injected failures; speaker advancement and append must reconcile as one logical operation.
5. Persist drafts on debounce and lifecycle flush; restore after reload/kill; clear only after confirmed send.
6. Preserve the exact typed draft if any operation fails.

Gate:

- Failure-injection tests prove zero-or-one append and correct speaker.
- Kill/relaunch test restores the exact draft on both physical platforms.
- Concurrent external modification cannot make edit/delete target another message.

### Checkpoint 2 — Keyboard, safe area, and compose dock (P0/P1)

Files:

- `src/viewport.ts`: own the complete final clearance calculation.
- `src/plugin.ts`: only apply the tested result.
- `styles.css`: mobile safe areas, sizes, 16 px composer text, compact shell.
- `tests/viewport.test.ts`: rotation, tall keyboard, toolbar, floating/hardware keyboard cases.
- `tests/mobile-harness.ts`: consume production layout output without an extra cap.

Work:

1. Remove the 50% clearance cap from `src/plugin.ts:391`.
2. Model the final applied clearance in the pure viewport function.
3. Combine measured Obsidian toolbar clearance with `env(safe-area-inset-bottom, 0px)` without double counting; prove it on devices.
4. Keep the compose dock visible through keyboard resize/scroll/rotation and open-close-open cycles.
5. Avoid automatic iOS zoom by using at least 16 px composer input text on mobile.
6. Preserve scroll anchor when the keyboard opens; scroll to bottom only if the user was already near bottom or just sent a message.

Gate:

- Composer has no overlap and no unexplained gap in every matrix viewport.
- Header, draft, and scroll position do not jump after five keyboard cycles or rotation.

### Checkpoint 3 — Mobile interaction hierarchy and touch targets (P1)

Files:

- `src/plugin.ts`: split `renderHeader`, composer, and overflow menu into focused helpers or components.
- recommended new `src/ui/header.ts`, `src/ui/composer.ts`, `src/ui/message.ts`.
- `styles.css`: mobile hit regions and one-row context bar.
- DOM/component tests for labels, target classes, focus order, and state transitions.

Work:

1. Replace the stacked mobile header actions with title + one overflow button.
2. Put prompts, participant editing, raw mode, and export in an Obsidian menu/sheet.
3. Replace the small sender pill with a two-option `radiogroup`/segmented speaker selector showing both names and selected state.
4. Make all mobile targets at least 48×48 CSS px; use 44 px only if an iOS-specific exception is deliberately documented.
5. Keep active speaker visible with the keyboard open.
6. Add visible pressed, busy, disabled, success, and failure states without relying on color alone.

Gate:

- One-handed test users can identify the speaker, switch, attach, and send without instruction.
- VoiceOver/TalkBack announces the selector and each action accurately.

### Checkpoint 4 — Incremental transcript, safe actions, and accessibility (P1)

Files:

- `src/plugin.ts` and new UI modules: keyed reconciliation.
- `src/model.ts`: stable message identity.
- `styles.css`: explicit message action affordance and focus treatment.
- new performance and accessibility-oriented DOM tests.

Work:

1. Stop clearing and Markdown-rendering the complete transcript on every modify event.
2. Reconcile additions/edits/deletes by stable ID; coalesce duplicate vault/cache events.
3. Preserve the reader's scroll anchor; show “Jump to latest” when away from the bottom.
4. Remove `tabindex=0` from passive bubbles. Keep interactive Markdown and an explicit labeled message menu focusable.
5. Replace live-region rebuilds with a dedicated, minimal announcer.
6. Add Undo for deletion. Keep long-press as an optional shortcut, not the sole path.

Performance budgets to adopt and then tune from evidence:

- Existing 500-message text conversation becomes interactive without a visibly blank intermediate state.
- Sending one message does not rerender 500 old messages.
- Scrolling remains stable during external sync modification.
- 2,000-message test does not crash the supported lower-memory Android device.

Gate:

- Performance traces and screen recordings meet the above behavioral budgets.
- VoiceOver/TalkBack traversal does not reannounce the transcript after send.

### Checkpoint 5 — Attachments and mobile forms (P1)

Files:

- `src/plugin.ts`: extract attachment workflow.
- new `src/attachments.ts` and tests.
- `src/modals.ts`: mobile-aware focus/dismiss behavior.
- `styles.css`: attachment tray and mobile modal/sheet rules.

Work:

1. Resolve picker cancel and remove hidden input in all outcomes.
2. Validate size/type before `arrayBuffer()`; warn before high-memory imports.
3. Represent pending attachments as removable chips with status.
4. Track draft-owned files and prevent abandoned orphans.
5. Test HEIC and unsupported preview fallback; never imply an attachment is embedded until persistence succeeds.
6. Avoid mobile modal autofocus; use progressive participant sections and sticky safe-area actions.
7. Warn before dismissing dirty forms.

Gate:

- Photo/document selection, cancel, denial, large file, low storage, and app background cases preserve user intent and leave no unexplained files.

### Checkpoint 6 — Physical release gauntlet

Artifacts:

- `MOBILE_TEST_EVIDENCE.md`
- device screenshots/screen recordings stored outside the release bundle
- final issue ledger with owner, severity, proof, and disposition

Run:

1. Clean install, update from 1.0.0, disable/re-enable, and uninstall readability checks.
2. Full device matrix from `MOBILE_UX_AUDIT.md`.
3. Theme, text scale, VoiceOver/TalkBack, keyboard, rotation, lifecycle, sync, attachment, and long-history passes.
4. Independent reviewer repeats the core workflow without setup coaching.

Release gate:

- Zero open P0/P1 defects.
- Both physical platforms pass the reliability workflow.
- No real personal journal content appears in evidence.
- Release bundle is a production build and contains only intended assets.

## File-level change map

| File | Recommended responsibility/change |
|---|---|
| `src/plugin.ts` | Reduce from a 447-line UI/persistence coordinator; delegate drafts, operations, attachments, and UI components. Avoid whole-chat rerenders. |
| `src/model.ts` | Parse legacy format plus stable conversation/message IDs; provide pure idempotent transformations and ID-based edit/delete. |
| `src/viewport.ts` | Produce the exact final clearance applied in production, including safe-area/toolbar strategy; no second cap elsewhere. |
| `src/modals.ts` | Disable automatic focus on mobile; add dirty-dismiss protection and mobile sheet semantics. |
| `src/settings.ts` | Keep settings light; optionally add accessibility-safe contrast validation and mobile behavior toggles only when evidence shows a need. |
| `src/drafts.ts` (new) | Versioned draft persistence, debounce/flush/restore/clear, rename-safe keying. |
| `src/operations.ts` (new) | Idempotent operation IDs, send reconciliation, failure recovery, stable edit/delete. |
| `src/attachments.ts` (new) | Picker lifecycle, validation, pending attachment state, cleanup, persistence errors. |
| `src/ui/header.ts` (new) | Compact title and overflow hierarchy. |
| `src/ui/composer.ts` (new) | Speaker selector, textarea, attachment tray, send/busy/error state. |
| `src/ui/message.ts` (new) | Semantic message DOM, explicit actions, incremental update. |
| `styles.css` | 48 px mobile targets, safe areas, 16 px textarea, one-row header, compose dock, attachment chips, accessible states. |
| `tests/viewport.test.ts` | Test final applied geometry, landscape, offsets, toolbar/safe-area interactions, cycles. |
| `tests/mobile-harness.*` | Reuse production DOM factories; add interaction/a11y checks rather than copied static markup only. |
| `TESTING.md` | Replace unversioned geometry claims with dated evidence matrix and explicit beta gate. |
| `README.md` | After proof, replace simulator-only mobile implication with a physical Obsidian mobile screenshot and supported-device statement. |

## Decision rules

- Reliability beats animation and visual mimicry.
- Never clear a durable draft before confirmed persistence.
- Never identify mutable content only by array index.
- Never make a gesture the only way to perform an action.
- Never claim mobile support from browser simulation alone.
- Keep Markdown readable and backward compatible.
- Use Obsidian-native menus, notices, icons, lifecycle, and Vault APIs where available.
- Keep the first beta focused on one conversation; add a Solomon home screen only after the conversation loop is proven.

## Immediate next action

Begin with Checkpoints 0 and 1. Do not spend the next implementation cycle polishing the current header. The highest-value work is proving that a long draft and a send operation survive mobile lifecycle interruption without loss, duplication, or wrong-speaker attribution.
