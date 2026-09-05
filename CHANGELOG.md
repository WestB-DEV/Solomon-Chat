# Changelog

## Unreleased — private test candidate

### Added

- Per-conversation background color and vault-local wallpaper, accessed from the existing conversation menu or command palette. Reset to the native theme at any time.
- Opaque theme backing for text bubbles and message actions over custom backgrounds.

### Fixed

- Keep the same focus-eligible composer during sending instead of toggling read-only mode and refocusing it afterward. Briefly guard draft edits while saving to prevent data loss.
- Preserve the reader's focus and text selection across rendering and send completion.
- Remove the empty-chat prompt after the first message and follow the latest message across rendering and layout changes without pulling readers out of history.

Native iPhone keyboard/header acceptance remains pending. These changes have not been publicly released.
