# Solomon Chat Mobile Beta 1 Test Gate

This is a private review build, not a public release. Use a synthetic test vault only.

## Artifact

After `node esbuild.config.mjs production`, copy these files into a test vault's `.obsidian/plugins/solomon-chat/` directory:

- `main.js`
- `manifest.json`
- `styles.css`

Enable the plugin after fully closing and reopening Obsidian. Keep a backup of the synthetic vault. Do not use a real journal until the physical gate passes.

## Required physical evidence

Record device model, OS, Obsidian version, keyboard, plugin version, theme, result, and a screenshot or short recording for every row.

| Gate | iPhone 13 | Boox Note 4C |
|---|---|---|
| Focus/dismiss keyboard five times in portrait | Pending | Pending |
| Rotate with keyboard open; composer and Send remain visible | Pending | Pending |
| Long multiline draft; background, kill, reopen, exact restore | Pending | Pending |
| Switch speaker and rapidly double-tap Send; one message, correct speaker | Pending | Pending |
| Text scaling; no clipped or overlapping essential controls | Pending | Pending |
| VoiceOver/TalkBack traversal and labelled actions | Pending | Pending |
| Camera/photo library JPEG, PNG, HEIC | Pending | Pending |
| Files/Documents PDF, picker cancel, permission denial | Pending | Pending |
| Large-file warning/rejection and low-storage failure | Pending | Pending |
| Delete with Undo; external insertion does not change target | Pending | Pending |
| Continue to a new page and follow both raw wikilinks | Pending | Pending |
| Reopen/rename/interruption repair across continuation boundary | Pending | Pending |

Overlap, hidden Send, lost draft, duplicate/wrong-speaker send, orphaned continuation, duplicated message truth, or an inaccessible essential action is a release failure.

## Deterministic gate

Run with the checked-in Node dependencies:

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run
node esbuild.config.mjs production
git diff --check
```

The synthetic continuation test generates 10 linked segments, 20,000 unique messages, and at least 2.5 MiB aggregate Markdown entirely in memory.
