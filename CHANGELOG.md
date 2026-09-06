# Changelog

## 1.2.1 (2026-09-06)

- Address the iPhone 13 report of the keyboard closing on Send: handle mobile touch activation inside the composer, cancel touch defaults, and focus synchronously during the gesture rather than after saving.
- Reject canceled, dragged, multi-touch-start and out-of-bounds Send gestures; retain click-only accessibility activation and duplicate-send protection.
- Add a failing-before/passing-after modeled host-dismiss regression, while retaining slow-save and no-focus-steal checks. Android emulator touch-send verification passes; resolution on a physical iPhone is awaiting user confirmation.

## 1.2.0 (2026-09-06)

### Added

- Per-conversation picture wallpapers and colors, with Obsidian's native searchable vault picture chooser.

### Fixed

- Keep the drafting UI mounted and focused through sends, avoiding deliberate keyboard dismissal/reopening.
- Follow new messages reliably after rendering, resizing, and concurrent transcript edits; preserve history-reading position with a Latest control.
- Use mobile Enter for new lines and the chat Send button for sending.
- Clear Obsidian's raised mobile navigation bar without adding duplicate keyboard spacing.
- Guard asynchronous form saves against duplicate submissions and premature dismissal.

Published from the tested RC2 implementation. Windows and Android emulator smoke tests, 45 unit tests and ten responsive browser cases passed. Physical iPhone testing remains unverified and feedback is welcome. Earlier RC entries below are historical records.

## 1.2.0 — private RC2 (2026-09-06, not publicly released)

- Add Obsidian's native searchable picture chooser for vault-local chat wallpapers.
- Preserve follow-latest behavior when a concurrent edit forces transcript rebuilding; keep Latest available while reading history.
- Keep the mobile keyboard Enter/newline action and persistent composer covered by regression tests.
- Account for Obsidian's raised mobile navigation bar so it does not overlap the composer.
- Prevent dismissal and editing during asynchronous form saves.

Windows and Android emulator smoke tests pass; physical iPhone acceptance remains unverified.

## 1.2.0 — private RC1 (2026-09-05, not publicly released)

### Added

- Per-conversation background color and vault-local wallpaper, accessed from the existing conversation menu or command palette. Reset to the native theme at any time.
- Opaque theme backing for text bubbles and message actions over custom backgrounds.

### Fixed

- Keep the same focus-eligible composer during sending instead of toggling read-only mode and refocusing it afterward. Briefly guard draft edits while saving to prevent data loss.
- Preserve the reader's focus and text selection across rendering and send completion.
- Remove the empty-chat prompt after the first message and follow the latest message across rendering and layout changes without pulling readers out of history.
- Preserve own-send scroll intent through unchanged refreshes during a slow save, and keep the Latest control available after duplicate renders.

Native iPhone keyboard/header acceptance remains pending. These changes have not been publicly released.
