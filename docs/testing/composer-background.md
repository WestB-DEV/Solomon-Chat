# Persistent composer and per-chat backgrounds

Private candidate, 2026-09-04. No public main/release/store change.

## Scope

Sending retains the textarea DOM node, editable keyboard eligibility, focus and draft. `beforeinput` briefly blocks edits during persistence; an input fallback protects the captured draft from non-cancelable input. This deliberately does not support composing the next message while the current one is still saving. Duplicate sends, sender changes and attachments remain guarded. Success clears the sent draft without refocusing; failure retains it. A user who moves focus away is not pulled back.

Backgrounds use the existing native menu, modal, color picker, reset button and a vault-relative wallpaper path field. Six-digit hex colors and vault-local PNG/JPEG/WebP/GIF/AVIF paths are validated before saving and again when read from Markdown. Remote, absolute, traversal, control-character and SVG paths are rejected. Images resolve through `Vault.getResourcePath`; missing files fall back to color/theme. Bubbles, metadata and controls retain theme surfaces for contrast. No new permanent toolbar controls.

## Evidence

- New composer test failed on the old read-only toggle, then passed after fixing it.
- 45 Vitest tests pass, including color/path validation and Markdown persistence.
- TypeScript and production build pass. ESLint has no errors, with one pre-existing settings-search warning.
- The browser regression exercises production code/CSS in Windows Edge with mocked Obsidian view/settings/Markdown APIs and in-memory persistence boundaries. Five viewports × light/dark = ten cases: 375×667, 390×844, 844×390, 430×915, 1280×900.
- Checks cover the earlier scrolling matrix, focus-eligible stable composer, beforeinput protection, delayed successful send, duplicate-send suppression, failure draft recovery, no focus theft after moving away, and selection preservation.
- Background checks operate the modal: invalid remote path error, save color, reset to theme, plus valid image resource resolution and missing-image fallback. A translucent-theme test failed before opaque backing was added and passes afterward.
- Reduced motion makes final computed-color checks and screenshots deterministic. Screenshots represent a mocked host, not native Obsidian visual acceptance.
- Independent read-only review identified contrast and command-availability issues; both were corrected. Implementation and shared browser sessions remained serial.

## Native acceptance still required

On iPhone and Android: focus the draft, send several messages, and confirm the keyboard stays open with no close/reopen flicker; verify manual keyboard dismissal still works. Check slow and failed saves, rotations and the earlier first-message/header report. Desktop: send with Enter and click, then switch focus during a slow save. On all hosts: set/reset a background, reopen the note, verify per-chat isolation and wallpaper contrast. Real virtual-keyboard behavior, native host dialogs, and physical iPhone rendering were not verified in this Windows browser harness.
