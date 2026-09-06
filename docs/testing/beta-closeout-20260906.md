# Solomon Chat RC2 closeout — 2026-09-06

## Scope

Persistent composer, follow-latest scrolling, mobile Enter/newline, native picture-background selection, and integration with Obsidian's mobile navbar. Work stayed on fix/iphone-chat-visibility with private history; public main/release/store submission were not changed.

## Automated evidence

- TypeScript check and production bundle build pass.
- 45 Vitest tests pass.
- ESLint: zero errors; existing settings-search warning remains.
- Production dependency audit: no known vulnerabilities.
- Compiled-bundle browser harness: ten cases across 375×667, 390×844, 844×390, 430×915 and 1280×900, each light/dark. Includes actual mobile Enter input, persistent composer, own-send scroll after unchanged refresh/concurrent earlier-message edits, incoming rebuild Latest state, late content resize, picture filtering/selection/persistence, asynchronous modal save protection, and raised navbar inset (52+24=76px).

## Native smoke tests

Isolated SolomonMobileTest vaults only. No personal conversations used.

- Windows Obsidian 1.13.7: native Chat background → Choose picture search → selection → Save succeeds; frontmatter and displayed wallpaper persist. Existing send-continuity evidence is recorded in the RC1 report.
- Android 15 emulator, Obsidian 1.13.6: physical input sequence with KEYCODE_ENTER produces two lines without sending. Tapping chat Send from history returns to latest (remaining scroll gap 0.455 CSS px), keeps focus and clears draft.
- Android native vault picture chooser saves Wallpaper test.png, resolves its local resource URL, and displays it. Fixture is a synthetic chat screenshot, not a user's photo.
- Final Android navbar regression: composer bottom was 749.273 vs navbar top 733.273 (16px overlap). Including Obsidian's --navbar-bottom-offset moves composer bottom to 725.273, leaving 8px separation. Keyboard-open clearance remains 0 with host-resized view, avoiding duplicate padding.

## Design decision and limits

An experimental direct device file picker hung isolated Windows and Android test views after selection. It was removed; the shipped feature uses Obsidian's vault picture chooser. Add photos to the vault before choosing them. Existing unrelated attachment import code was not changed or revalidated here.

Physical iPhone, accessibility assistive-technology testing, third-party theme coverage, and exhaustive attachment/native acceptance remain unverified. This report does not claim store approval or a public release.

Independent review reproduced and helped close the concurrent-edit scroll failure; native device sessions and integration stayed serial.
