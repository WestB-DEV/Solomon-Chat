# Testing

Last local verification: 2026-09-03 (America/Los_Angeles)

## Automated checks

Run:

```sh
npm install
npm run check
```

The check runs the official Obsidian-specific ESLint rules, the Markdown/storage regression suite, mobile viewport calculations, TypeScript type-checking, and the production esbuild bundle.

Covered cases include:

- Existing human-readable `[left/right, timestamp]` notes
- Multiline Markdown and embedded image links
- Editing and deleting individual messages without damaging frontmatter
- Ordinary notes remaining untouched
- iPhone visual-viewport keyboard behavior
- Android visual-viewport offsets
- Android shells that resize the layout viewport directly
- Desktop isolation from mobile keyboard logic

## Local visual mobile harness

Build and serve the harness:

```sh
npm run build:harness
python3 -m http.server 4173
```

Then open:

- iPhone: `http://localhost:4173/tests/mobile-harness.html?device=iphone`
- Android: `http://localhost:4173/tests/mobile-harness.html?device=android`

The harness uses the production stylesheet and imports the same pure viewport calculation used by the plugin.

### Recorded geometry

| Scenario | Clearance | Composer gap | Overlap | Header |
|---|---:|---:|---:|---|
| iPhone 15, toolbar visible | 54 px | 8 px | 0 px | Visible |
| iPhone 15, keyboard open | 334 px | 8 px | 0 px | Collapsed |
| Pixel 9, toolbar visible | 56 px | 10 px | 0 px | Visible |
| Pixel 9, keyboard open with 24 px visual offset | 331 px | 5 px | 0 px | Collapsed |

An Android open → close → open cycle returned the composer to the same `625.75 px` bottom coordinate and `331 px` clearance, indicating no cumulative drift. The message list and composer stayed visible while the header collapsed, and keyboard changes only changed classes/CSS clearance rather than rerendering the conversation.

## 2026-09-02 interface-polish acceptance pass

The production stylesheet and shared viewport logic were checked in the browser harness at:

- iPhone portrait: 375 x 844, keyboard closed and open
- Android portrait: 430 x 915, light and dark, keyboard closed and open
- Short landscape: 667 x 375 with the keyboard open
- Large mobile text: 375 x 844
- Windows desktop: 1440 x 900
- Narrow desktop pane: 768 x 800
- Reduced motion: bubble animation disabled, control transitions disabled, and message scrolling changed to `auto`

All measured layouts had zero horizontal page/root overflow, controls met their 40 px desktop or 48 px mobile minimums, and keyboard-open layouts retained a 6 px composer gap.

The plugin was also installed into an isolated Android 15 emulator vault running Obsidian 1.13.6. The real Obsidian shell was checked in portrait, dark mode, keyboard-open portrait, and keyboard-open landscape. The plugin dynamically cleared Obsidian's fixed top header and raised bottom navigation; message metadata remained hidden; the composer and speaker selector remained operable. The emulator's original appearance and rotation settings were restored afterward.

A separate native Obsidian 1.13.6 Windows vault was tested at 1024 x 800. The conversation header, empty state, transcript, speaker selector, pending-attachment chip, attachment bubble, and composer all stayed contained with comfortable edge clearance and no visible horizontal clipping. The pass created a conversation, sent exactly one message from each perspective, selected and sent a file through the Windows file picker, and opened the note in Obsidian's raw Markdown view.

### Attachment, Markdown, and draft continuation

The follow-up acceptance pass exercised the complete Android document-picker path with `android-attachment.txt`:

- Cancel returned to Obsidian, and the picker reopened immediately on the next tap.
- Selecting the file created a removable pending chip but did not copy anything into the vault before Send.
- Sending an attachment-only message created exactly one vault-owned file under `Android Acceptance.attachments` and one ordinary relative Markdown link in the conversation.
- The source and copied files had the same SHA-256 value: `a58bd3ad40dc43544594ff1d277908846d5c7b3853f3c8fcb05786ebd7a6988d`.
- Tapping the rendered file link opened Android's compatible-app chooser.
- Raw Markdown mode showed the new speaker heading, body, and link as readable standard Markdown while retaining legacy bracket-marker messages.

The same emulator also passed two durable-draft lifecycle tests. The exact text `Draft_survives_forced_restart_without_losing_a_single_word_20260902` was typed, allowed to persist, and recovered after force-stopping and relaunching Obsidian. A stricter case typed `Visibility_flush_survives_background`, immediately sent Obsidian to the background, force-stopped it there, and recovered the exact text on relaunch. In both cases, Send appended the text exactly once under the selected speaker, advanced `next-side` in the same note write, kept plugin data in the clean version-2 schema, and cleared the stored draft only after the append succeeded. A second relaunch showed the sent message and an empty composer.

Automated coverage now contains 37 passing tests across the Markdown model, fenced-code-safe and conflict-safe message targeting, unrelated-whitespace preservation, atomic message/frontmatter transformation and commit reconciliation, legacy and current marker parsing, attachment validation/link encoding, durable send-operation records and cleanup-ledger validation, initial history windows, and viewport geometry.

The new pending-attachment state was also screenshot-checked at 430 x 915 light/dark, 375 x 844 with large text, 667 x 375 with the keyboard open, 1440 x 900 desktop, and a 768 x 800 narrow desktop pane. All measured states had zero horizontal overflow; mobile controls remained 48 px, desktop controls remained 40 px, and keyboard-open states retained a 6 px gap.

Two injected-failure checks were then run in the real Android Obsidian runtime against the production bundle. A deliberately delayed send was followed by immediate navigation to another conversation containing its own saved draft. The source text appeared exactly once in the source note, zero times in the destination note, and the destination draft remained byte-for-byte intact. A second send injected a plugin-data failure only after the Markdown commit. The message still appeared exactly once, the UI correctly treated it as sent, no attachment rollback path ran, and a forced app restart reconciled the persisted operation marker without restoring or duplicating the sent draft.

Two additional send-integrity checks covered note movement and process interruption. During a delayed Android send, the source note was moved into another folder. The message committed exactly once to that same `TFile`, its attachment link was calculated from the live destination path (`../…attachments/msg-…/file`), the composer cleared only on the source view, and sender controls stayed disabled until completion. For the interruption test, the app was force-stopped after a real attachment had been copied but before the note commit. On restart the note still contained zero copies of the message, the uniquely owned `msg-…` attachment folder was removed, and the exact draft text returned in an editable composer without a stale operation marker.

The final concurrency pass navigated from an attachment send to an ordinary note and back before the delayed commit. The recreated source view remained read-only, raw Markdown was refused during the operation, the copied folder stayed present, an attempted duplicate send added zero messages, and the original committed exactly once. A real two-leaf Android workspace repeated the test: both composers locked during the shared-file operation, the second leaf could not submit a duplicate, and both unlocked afterward. Cleanup paths are now derived only from the conversation's live attachment root plus a generated 16-hex message ID; persisted arbitrary paths are not accepted. When an injected trash failure was followed by an immediate retry, the failed operation stayed in a separate cleanup ledger, the retry committed exactly once, and reopening removed the old folder and ledger entry without touching the successful attachment folder.

The Markdown parser and editor now ignore marker-looking lines inside backtick or tilde code fences. Regression tests prove that fenced legacy and modern markers remain message content, real messages after the fence remain independently editable, and a marker inside an ordinary note's code fence does not activate Solomon Chat.

### Message actions and long-history continuation

The real Android 15 Obsidian shell was used for the revised message-action path. Tapping a bubble revealed one low-emphasis 48 px overflow control with full edge clearance. Tapping that control opened Obsidian's native bottom sheet with Edit and Delete actions. Delete opened a separate confirmation containing the irreversible effect, an exact message preview, a cancel route, and the explicit statement that attached files remain in the vault. The destructive confirmation was not activated during visual acceptance.

Edit and Delete now resolve a current message by durable ID inside the serialized `vault.process` operation. If the ID is duplicated, the content changed while a modal was open, or an ID-less legacy message is ambiguous, the operation refuses to guess and leaves the note unchanged. Editing or deleting one block no longer collapses blank lines elsewhere in the user-owned Markdown file.

A generated 2,000-message conversation was opened in the Android emulator. Initial paint contained exactly 200 `.solomon-chat-message` nodes and a 48 px `Show earlier messages (1,800)` control. Activating it produced exactly 400 nodes, changed the remaining count to 1,600, and held the same message at the same measured 62 px viewport offset. While the reader remained in earlier history, an external append added exactly one DOM node, preserved that offset and scroll position, and exposed a 91 x 48 px `Latest` control. Activating `Latest` reached the true bottom and removed the control from focus and the accessibility tree.

The action-clearance matrix was extended to 320 x 720. The 48 px message action remained fully inside the clipped root, and the `Latest` control was moved into a conditional row above the composer so it no longer covers message text at narrow widths. The row disappears completely when the control is hidden. The final production bundle was also rechecked in Android Obsidian: the 91 x 48 px control sat between the message viewport and composer with measured non-overlap on both edges and zero root overflow.

Native Windows Obsidian 1.13.6 was launched again after the Windows Security dialog was no longer present. In the isolated test vault, `WINDOWS_NATIVE_SEND_20260903` and `WINDOWS_NATIVE_REPLY_20260903` each appeared exactly once on opposite sides. The real Windows picker queued `attachment-fixture.txt` in a contained composer chip and Send created one ordinary relative Markdown link. The source and copied files shared SHA-256 `A2C7EEEDF44F684CABB533D7804E750526B5CC85F84C53E930B4ACB802F73C21`. `Edit raw Markdown` opened the same note in Obsidian with readable YAML, standard speaker headings, timestamps, message bodies, identity comments, and the relative attachment link. The desktop harness additionally measured a 40 x 40 px message action, 88 x 40 px `Latest` control, zero root overflow at 1440 x 900, and the responsive 768 x 800 layout.

Curated Android acceptance screenshots are preserved in [`docs/testing`](docs/testing/README.md). They show the production plugin inside the real Android Obsidian shell rather than only the standalone harness.

Durable harness captures are preserved beside them for desktop and the highest-pressure iPhone-size state. The 1440 x 900 desktop capture measured zero root overflow, 70 px composer side insets, and 40 x 40 px controls. The 375 x 844 iPhone-size capture combined an open keyboard, large text, a pending attachment, and a visible message action; it measured zero root overflow, 8 px composer side insets, a 6 px keyboard gap, and 48 x 48 px action/attach/send controls.

### 2026-09-03 iPhone hardening continuation

The production layout now includes direct `env(safe-area-inset-*)` fallbacks on all four edges. Measured Obsidian toolbar and keyboard clearance still wins when it is larger, so the fallback does not stack a second full inset on top of native chrome. Mobile identity is also explicit rather than inferred only from width; iPhone/Android landscape and tablet-class mobile shells therefore retain 48 px targets even above the 700 px phone breakpoint.

The iPhone harness matrix was expanded to 320 x 568 compact portrait, 375 x 844 portrait, and 844 x 390 landscape. Its highest-pressure states combine 28 px accessibility text, a visible message action, a pending attachment, the `Latest` row or delete confirmation, an open software keyboard, 59/34 px portrait safe areas, and 47 px landscape notch insets. All measured states had zero horizontal overflow and zero message/composer overlap. Portrait retained a 6 px keyboard gap, landscape retained 10 px, and every production control stayed at least 48 x 48 px. Five complete open/close keyboard cycles alternated between the same `548 px` and `828 px` composer bottoms without drift.

The visual review also caught a 3.83:1 white-on-accent message-bubble pairing. Theme-adaptive right bubbles now use a restrained accent tint with normal theme text; the current harness measures 8.24:1 in light mode and 5.49:1 in dark mode. Left bubbles measure 14.34:1 and 9.84:1 respectively. The saturated accent remains on the send control, where the icon pairing already clears the non-text contrast threshold.

This exact rebuilt bundle was installed into the Android 15 emulator and reopened in Obsidian 1.13.6. Current-bundle portrait, landscape, and dark-mode screenshots confirm the calmer bubble treatment, readable text, retained mobile target sizing, safe system-bar clearance, and uncluttered composer. Emulator rotation and night-mode settings were restored to their original automatic-portrait/light values after capture.

### 2026-09-03 interaction-spacing and Android host-resize continuation

The interaction rhythm is now explicit rather than incidental. Message actions sit 8 px from their bubbles, and the attachment button, textarea, and Send control retain 8 px gaps. Mobile action controls remain 48 x 48 px and desktop controls remain 40 x 40 px. Attachment chips now use the composer as their width boundary instead of `100vw`, preventing a chip from borrowing space from the rest of an Obsidian split window.

The final production CSS was measured in two high-pressure harness states. At 320 x 568 with 28 px accessibility text, a pending attachment, a visible message action, and the keyboard open, the action and both composer gaps measured exactly 8 px, all three controls measured 48 x 48 px, the 288 px attachment stayed inside the 308 px composer, and overflow/overlap were both 0 px. In a 768 x 800 Windows workspace with a 460 px plugin pane, the contained attachment measured 202 px, controls remained 40 x 40 px, all three gaps remained 8 px, and overflow/overlap were again 0 px.

User-like testing in the real Android 15 Obsidian shell then found a host-specific issue the deterministic harness could not reproduce. Gboard shrank only the plugin root from `807.273 px` to `508.358 px`; `window.innerHeight` and `visualViewport.height` both remained approximately `807 px`. Because no viewport event fired, Solomon retained the closed Obsidian-toolbar inset and left an unnecessary `86 px` gap above the keyboard. The plugin now observes its own root size, recognizes this host-resized keyboard mode, and applies zero duplicate toolbar clearance. Edge-toolbar detection also rejects fixed layers outside a 160 px edge band, preventing a full-screen Obsidian layer from being mistaken for a toolbar during plugin reload.

The rebuilt bundle was installed and its SHA-256 matched the emulator copy. Live WebView measurements after the fix showed `bottomClearance: 0 px`, `paddingBottom: 6 px`, and a `6 px` composer-to-keyboard gap; the message viewport grew from `162.449 px` to `242.449 px` without moving the composer under Gboard. Five complete close/open cycles returned to the exact same closed composer bottom (`721.273 px`) and open composer bottom (`502.358 px`) every time, with no drift. The curated before/final keyboard screenshots and the final 8 px message-action screenshot are in [`docs/testing`](docs/testing/README.md).

## Still required before public launch

Browser simulation cannot perfectly reproduce Obsidian's Capacitor shells, third-party keyboards, safe areas, or device-specific native toolbars. Before submitting to the Obsidian community directory, run the manual checklist on at least one physical iPhone and one physical Android device:

1. Open an existing long conversation and scroll.
2. Focus the composer, type multiple lines, send, attach an image, and switch speakers.
3. Open and close the keyboard at least five times.
4. Rotate portrait → landscape → portrait.
5. Try the device's default keyboard plus any keyboard commonly used by testers.
6. Confirm there is no gap, overlap, jump, focus loss, or draft loss.
7. Disable the plugin and confirm the note and attachments are still readable.
