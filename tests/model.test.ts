import { describe, expect, it } from "vitest";
import { appendMessage, applySend, ensureMessageIds, parseConversation, replaceMessage, replaceMessageById } from "../src/model";

const fixture = `---
solomon-chat: true
left-name: Future Me
right-name: Me
next-side: right
attachment-folder: Solomon Conversations/Test.attachments
---

[right, 2026-07-12 09:12]
Today felt heavy.

[left, 2026-07-12 09:13]
You handled it better than you think.
`;

describe("Markdown conversation model", () => {
  it("parses the documented format without hiding content", () => {
    const result = parseConversation(fixture, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" });
    expect(result.isConversation).toBe(true);
    expect(result.leftName).toBe("Future Me");
    expect(result.messages.map(({ side, timestamp, content }) => ({ side, timestamp, content }))).toEqual([
      { side: "right", timestamp: "2026-07-12 09:12", content: "Today felt heavy." },
      { side: "left", timestamp: "2026-07-12 09:13", content: "You handled it better than you think." },
    ]);
    expect(result.messages.every((message) => message.id.startsWith("legacy-"))).toBe(true);
  });

  it("preserves multiline Markdown and attachments", () => {
    const content = appendMessage(fixture, "right", "2026-07-12 09:14", "A list:\n\n- one\n- two\n\n![photo](Test.attachments/photo.jpg)");
    const result = parseConversation(content, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" });
    expect(result.messages.at(-1)?.content).toContain("![photo](Test.attachments/photo.jpg)");
    expect(result.messages.at(-1)?.content).toContain("- two");
  });

  it("edits and deletes one message without damaging frontmatter", () => {
    const edited = replaceMessage(fixture, 0, "A corrected thought.");
    expect(edited).toContain("solomon-chat: true");
    expect(edited).toContain("A corrected thought.");
    expect(edited).toContain("You handled it better");
    const deleted = replaceMessage(edited, 1, null);
    expect(deleted).not.toContain("You handled it better");
    expect(parseConversation(deleted, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" }).messages).toHaveLength(1);
  });

  it("does not activate on an ordinary note", () => {
    expect(parseConversation("# Journal\n\nHello", {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" }).isConversation).toBe(false);
  });

  it("applies an idempotent send and advances the speaker in the same transformation", () => {
    const first = applySend(fixture, { id: "msg-operation-1", side: "right", timestamp: "2026-07-12 09:14", message: "Atomic thought" });
    const retried = applySend(first, { id: "msg-operation-1", side: "right", timestamp: "2026-07-12 09:14", message: "Atomic thought" });
    expect(retried).toBe(first);
    expect(first).toContain("next-side: left");
    expect(first.match(/id=msg-operation-1/g)).toHaveLength(1);
  });

  it("targets a stable message ID after external insertion shifts positions", () => {
    const withIds = appendMessage(appendMessage(fixture, "right", "2026-07-12 09:14", "First", "msg-first"), "left", "2026-07-12 09:15", "Target", "msg-target");
    const externallyChanged = withIds.replace("[right, 2026-07-12 09:14", "[left, 2026-07-12 09:13:30, id=external]\nExternal\n\n[right, 2026-07-12 09:14");
    const edited = replaceMessageById(externallyChanged, "msg-target", "Correct target");
    expect(edited).toContain("External");
    expect(edited).toContain("Correct target");
    expect(edited).not.toContain("\nTarget\n");
  });

  it("lazily persists legacy IDs without changing message truth", () => {
    const migrated = ensureMessageIds(fixture);
    expect(migrated.match(/id=legacy-/g)).toHaveLength(2);
    expect(parseConversation(migrated, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" }).messages.map((message) => message.content)).toEqual(["Today felt heavy.", "You handled it better than you think."]);
    expect(ensureMessageIds(migrated)).toBe(migrated);
  });
});
