# 1.2.0 private RC1 closeout

Scope: persistent composer, first-message visibility, follow-latest behavior and per-chat backgrounds. Not a public release or Obsidian store approval.

## Done

- 45 unit tests passed; TypeScript and production build passed.
- ESLint: zero errors, one existing settings-search warning in settings.ts.
- Dependency audit: no known vulnerabilities in full or production dependencies (same lockfile dependencies).
- Ten production-bundle browser cases passed: 375x667, 390x844, 844x390, 430x915 and 1280x900, each light/dark. Includes slow/failed sends, duplicate prevention, stable textarea, selection, no focus theft, empty state removal, keyboard-size changes, history/latest and background save/reset/path validation. This is a mock Obsidian host, not device proof.
- Independent review found an own-send scroll-intent race. Its new regression failed on the previous build and passes with the fix. Duplicate history renders are covered too.
- Native Windows Obsidian 1.13.7: exact 1.2.0 assets in isolated SolomonMobileTest vault; fresh two-sided conversation; Enter send twice; second draft typed without refocusing; both messages persisted exactly once; first bubble fully below header. Native menu/color picker saved #8a8ad6 and applied it while retaining readable bubble/control surfaces.
- Native Android 15 emulator, Obsidian 1.13.6: loaded plugin manifest 1.2.0 after reload. Fresh two-sided conversation, Android input plus touch Send twice. Same textarea object remained focused, no blur or visualViewport resize event recorded during either send, next draft typed without another tap, both messages persisted exactly once. Screenshot confirms keyboard present after both sends. This is emulator evidence, not physical-device proof.
- Android native-host background modal saved #e2edf8 through its input/change handlers and Save button; Markdown and screenshot confirm application. Android system color-picker gesture itself was not exercised.

## Evidence and test isolation

- android-rc-keyboard.png: native Android after two sends with keyboard open.
- android-rc-background.png: native Android saved color with readable messages/composer.
- chat-background-light.png and chat-background-dark.png: browser mock-host screenshots only.
- Native test notes: Beta RC 20260905.md (Windows), Beta RC Android 20260905.md (emulator), in isolated SolomonMobileTest vaults. No personal vault was modified.
- Earlier Beta Closeout draft contaminated by concurrent WinPaste clipboard testing was excluded. Native retest occurred only after desktop handback and confirmation no WinPaste process was running.
- Prior plugin files were backed up before test installation. No test-vault data belongs in the distributable.

## Pending gates / limitations

- Physical iPhone: keyboard flicker, initial header overlap, rotation and background acceptance remain unverified. Do not claim iPhone acceptance.
- Full native regression of every menu/attachment/export control, native long-history/rotation, slow/failing disk saves, wallpaper selection/reopen and community themes is not established by this narrow smoke test. Historical tests do not count as current-RC proof.
- Wallpaper currently takes a vault-relative image path, not a gallery picker. Composing the next message during an unfinished save is intentionally briefly locked; the keyboard-eligible composer itself stays mounted.
- Public distribution requires explicit release approval and Obsidian community review/merge. No public push, public release, tag or submission update performed in this closeout.

Independent review and regression work were delegated; shared native UI and integration stayed serial. The candidate is available for private beta testing, with the above gates explicitly open.
