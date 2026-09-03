# Goal completion audit

Audited on 2026-09-03 against the current worktree and runtime evidence.

| Requirement | Authoritative evidence | Verdict |
| --- | --- | --- |
| Send messages back and forth as two perspectives | Production Android Obsidian sends, speaker switching, exact-once navigation/failure checks, and Markdown model tests | Proven |
| Send files without copying before Send | Real Android document-picker run, byte-identical SHA-256 comparison, rendered-link opening, and attachment validation tests | Proven |
| Keep user-owned, readable Markdown if Obsidian disappears | Actual emulator vault files contain readable YAML, standard speaker headings, message bodies, and ordinary relative links; raw-mode screenshot and round-trip tests cover current and legacy markers | Proven |
| Preserve drafts and avoid duplicate/cross-note sends | Forced app restarts, background flush, navigation during delayed sends, note movement, two-leaf locking, post-commit failure, and cleanup-failure retry checks in Android Obsidian | Proven |
| Avoid orphaning or deleting unrelated attachment data | Per-message folders, ID-only validated cleanup ledger, cold-restart cleanup test, and independent re-audit | Proven |
| Clean Android UI with screenshots and measured margins | Thirteen curated production Android screenshots now include current-bundle portrait/landscape/dark regressions, the measured 8 px message-action gap, and before/final evidence for the native Gboard host-resize fix; five live keyboard cycles returned to identical geometry | Proven |
| Clean Windows UI | Native Obsidian 1.13.6 acceptance at 1024 x 800 covered two-sided sending, the Windows file picker, pending and sent attachment states, raw Markdown, and visible edge clearance; 1440 x 900 and a final 768 x 800/460 px split-pane harness check add measured containment, 8 px interaction gaps, and zero overflow | Proven |
| Approximate a clean iPhone experience | Eight current production-CSS harness captures cover 320 x 568 and 375 x 844 portrait, 844 x 390 landscape, 59/34 px portrait and 47 px landscape safe areas, 28 px accessibility text, light/dark contrast, open/closed keyboard, attachment/action/Latest/modal states, 8 px interaction gaps, and 48 px controls; five keyboard cycles return to identical geometry with 0 px overflow | Proven for the requested approximation; no physical iPhone or iOS simulator is available in this Windows environment |
| Automated regression and distributable build | 37 tests, TypeScript, production bundle, harness bundle, lint with zero errors, and `git diff --check` | Proven |

The implementation, native Android, native Windows, and production-CSS iPhone approximation satisfy the requested basic-function and visual-pass bar. A real iPhone check remains a pre-public-launch hardening step, not a blocker for this goal's explicitly approximate iPhone scope.
