# Testing

Last local verification: 2026-07-12 (America/Los_Angeles)

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

## Still required before public launch

Browser simulation cannot perfectly reproduce Obsidian's Capacitor shells, third-party keyboards, safe areas, or device-specific native toolbars. Before submitting to the Obsidian community directory, run the manual checklist on at least one physical iPhone and one physical Android device:

1. Open an existing long conversation and scroll.
2. Focus the composer, type multiple lines, send, attach an image, and switch speakers.
3. Open and close the keyboard at least five times.
4. Rotate portrait → landscape → portrait.
5. Try the device's default keyboard plus any keyboard commonly used by testers.
6. Confirm there is no gap, overlap, jump, focus loss, or draft loss.
7. Disable the plugin and confirm the note and attachments are still readable.
