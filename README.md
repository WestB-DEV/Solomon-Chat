# Solomon Chat

Solomon Chat turns an ordinary Obsidian note into a private, two-sided text conversation. It is designed for self-distanced journaling: write from your own point of view, switch sides, and respond with the perspective you would offer someone else.

Everything important remains plain Markdown. There is no account, cloud service, AI API, hidden message database, or proprietary chat file. Disable the plugin and every conversation is still readable and editable.

## Features

- Familiar left/right message bubbles with automatic speaker switching
- Per-conversation names, bios, and optional vault-image avatars
- Enter to send; Shift+Enter for a new line
- Multi-file attachments stored beside each conversation
- Optional research-informed perspective prompts
- Message editing and deletion (right-click or long-press)
- Raw Markdown mode and text transcript export
- Theme-aware or custom bubble colors
- Separate desktop, iPhone, and Android keyboard layout behavior
- Serialized writes so rapid sends cannot overwrite each other

## Markdown format

```md
---
solomon-chat: true
left-name: Wise Friend
right-name: Me
next-side: right
attachment-folder: Solomon Conversations/My Conversation.attachments
---

[right, 2026-07-12 09:12]
Today felt heavy.

[left, 2026-07-12 09:13]
You handled it better than you think.
```

Participant bios and avatar paths are optional frontmatter fields. Images and files use normal Markdown links.

## Install for development

1. Run `npm install` and `npm run build`.
2. Copy or symlink this directory into a test vault at `.obsidian/plugins/solomon-chat`.
3. Enable **Solomon Chat** under Obsidian → Settings → Community plugins.

Use a dedicated test vault while developing plugins. The release files Obsidian needs are `main.js`, `manifest.json`, and `styles.css`.

## Mobile layout design

The chat is three independent regions: header, scrollable messages, and composer. Textarea focus is the source of truth for compose mode. `visualViewport` resize/scroll events only update a CSS bottom-clearance variable, coalesced with `requestAnimationFrame` and a trailing update; they never rerender or translate the conversation.

Automated regression tests cover closed-keyboard, iPhone-style, Android-offset, and desktop viewport cases. Physical-device testing is still required before a public release because Obsidian, iOS, Android, keyboards, and device safe areas vary.

See [TESTING.md](TESTING.md) for the local mobile harness, recorded layout geometry, and physical-device launch checklist.

## Why “Solomon”?

[Grossmann and Kross (2014)](https://doi.org/10.1177/0956797614535400) found that people reasoned more wisely about other people’s relationship problems than their own, and that adopting a self-distanced perspective reduced that gap. Their measures included recognizing uncertainty, considering other perspectives, compromise, and future change. Solomon Chat’s optional prompts turn those ideas into writing cues; they are not medical or therapeutic advice.

## Privacy

The plugin reads and writes only files in your Obsidian vault and its own local settings. Attachments are imported into the conversation’s `.attachments` folder. Nothing is transmitted.

## License

MIT
