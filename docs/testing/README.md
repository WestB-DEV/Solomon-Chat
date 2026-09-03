# Visual acceptance evidence

## Android production evidence

These screenshots were captured on 2026-09-02 and 2026-09-03 from Solomon Chat running inside Obsidian 1.13.6 on an Android 15 emulator. They are visual acceptance evidence, not marketing mockups.

- [`android-attachment-chat-light.png`](android-attachment-chat-light.png) — readable bubbles, an ordinary linked attachment, long-text wrapping, and the fixed composer in light mode.
- [`android-raw-markdown-light.png`](android-raw-markdown-light.png) — the same note in Obsidian's Markdown reading/editing surface, showing standard speaker headings, message bodies, hidden identity comments, and the ordinary attachment link.
- [`android-long-history-light.png`](android-long-history-light.png) — the bottom of a 2,001-message conversation after the initial 200-message render and external append tests.
- [`android-latest-light.png`](android-latest-light.png) — the final production `Latest` control in its own non-overlapping row while the reader remains in earlier history.
- [`android-message-actions-light.png`](android-message-actions-light.png) — Obsidian's native mobile action sheet reached from the adjacent 48 px message action.
- [`android-delete-confirm-light.png`](android-delete-confirm-light.png) — explicit destructive confirmation with preview, attachment-retention explanation, Cancel-first ordering, and 48 px actions.
- [`android-chat-dark.png`](android-chat-dark.png) — the production chat interface under the emulator's real Android dark-mode setting.
- [`android-current-safe-area-contrast.png`](android-current-safe-area-contrast.png) — the current accessible accent-tint design in the production Android shell after the iPhone hardening changes were installed.
- [`android-current-landscape-safe-area-contrast.png`](android-current-landscape-safe-area-contrast.png) — the current bundle in native Android landscape with 48 dp mobile controls retained above system navigation.
- [`android-current-dark-safe-area-contrast.png`](android-current-dark-safe-area-contrast.png) — the current theme-adaptive bubbles in native Android dark mode; the emulator was returned to light mode afterward.
- [`android-action-spacing-pass.png`](android-action-spacing-pass.png) — the final native 48 px message action with a measured 8 px CSS gap from the selected bubble.
- [`android-keyboard-spacing-before.png`](android-keyboard-spacing-before.png) — diagnostic evidence of the Android host-resize bug: the composer remained safe but an 86 px duplicate toolbar gap wasted vertical space above Gboard.
- [`android-keyboard-resizeobserver-pass.png`](android-keyboard-resizeobserver-pass.png) — the corrected native Gboard state with zero duplicate toolbar clearance and a 6 px composer-to-keyboard gap.

The destructive confirmation was never activated. The emulator's system appearance was restored after dark-mode capture.

## Windows production evidence

On 2026-09-03, Solomon Chat was tested inside native Obsidian 1.13.6 for Windows in an isolated 1024 x 800 vault window. The conversation header, empty state, transcript, speaker selector, pending-attachment chip, attachment bubble, and composer all remained contained with comfortable edge clearance and no visible horizontal clipping. The pass created a conversation, sent one message from each side, selected and sent a real file through the Windows file picker, opened raw Markdown, and verified that the copied attachment's SHA-256 matched its source.

## Desktop and iPhone-size harness evidence

These captures use the production stylesheet and shared viewport calculation in the repository's deterministic browser harness. They are layout evidence rather than native-shell evidence.

- [`desktop-harness-light.png`](desktop-harness-light.png) — 1440 x 900 desktop workspace with a file sidebar, full conversation header, readable transcript, and restrained composer. Measured root overflow was 0 px, composer side insets were 70 px, and interactive controls were 40 x 40 px.
- [`iphone15-keyboard-large-text.png`](iphone15-keyboard-large-text.png) — 375 x 844 keyboard-open stress state with large text, a pending PDF, a visible message action, simulated 59/34 px safe areas, 0 px overflow, a 6 px keyboard gap, and 48 x 48 px controls.
- [`iphone15-safe-area-accessibility-text.png`](iphone15-safe-area-accessibility-text.png) — the same portrait pressure test with 28 px accessibility text. It retains 0 px overflow, 0 px message/composer overlap, a 6 px keyboard gap, and 48 px controls.
- [`iphone15-dark-safe-area-accessibility-text.png`](iphone15-dark-safe-area-accessibility-text.png) — the accessibility-text pressure test in dark mode. Measured bubble contrast is 5.49:1 on the right and 9.84:1 on the left.
- [`iphone15-closed-safe-area-accessibility-text.png`](iphone15-closed-safe-area-accessibility-text.png) — keyboard-closed portrait with header, `Latest`, pending attachment, composer, 59/34 px safe areas, and a 6 px gap above the mobile toolbar.
- [`iphone-landscape-safe-area-accessibility-text.png`](iphone-landscape-safe-area-accessibility-text.png) — 844 x 390 landscape with 47 px simulated notch clearance on each side, accessibility text, pending attachment, 48 px controls, 0 px overlap, and a 10 px keyboard gap.
- [`iphone-compact-accessibility-text.png`](iphone-compact-accessibility-text.png) — 320 x 568 compact-phone pressure test with accessibility text, a contained ellipsized attachment, 48 px controls, 0 px overflow, and 0 px overlap.
- [`iphone-compact-delete-confirm-accessibility-text.png`](iphone-compact-delete-confirm-accessibility-text.png) — the compact delete confirmation fully contained in the viewport with stacked 48 px actions.
- [`iphone-compact-spacing-pass.png`](iphone-compact-spacing-pass.png) — the final 320 x 568 pressure state: 28 px accessibility text, keyboard, attachment, and message action with exact 8 px interaction gaps, 48 px controls, and zero overflow/overlap.
- [`windows-narrow-spacing-pass.png`](windows-narrow-spacing-pass.png) — a 768 x 800 workspace with a 460 px plugin split pane; the attachment remains container-bound, controls remain 40 px, and measured overflow/overlap are zero.

Native Windows acceptance is complete. A physical iPhone or iOS simulator is not available in this Windows environment, so the iPhone artifacts above are explicitly labeled as harness evidence.

See [`COMPLETION_AUDIT.md`](COMPLETION_AUDIT.md) for the requirement-by-requirement evidence assessment and the remaining native-iOS gap.
