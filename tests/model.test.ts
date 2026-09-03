import { describe, expect, it } from "vitest";
import { appendMessage, appendMessageTransaction, hasMessageId, parseConversation, replaceMessage, replaceTargetMessage } from "../src/model";

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
    expect(result.messages).toEqual([
      { id: "", side: "right", timestamp: "2026-07-12 09:12", content: "Today felt heavy." },
      { id: "", side: "left", timestamp: "2026-07-12 09:13", content: "You handled it better than you think." },
    ]);
  });

  it("preserves multiline Markdown and attachments", () => {
    const content = appendMessage(fixture, "right", "2026-07-12 09:14", "A list:\n\n- one\n- two\n\n![photo](Test.attachments/photo.jpg)");
    const result = parseConversation(content, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" });
    expect(result.messages.at(-1)?.content).toContain("![photo](Test.attachments/photo.jpg)");
    expect(result.messages.at(-1)?.content).toContain("- two");
  });

  it("keeps storage metadata out of the visible timestamp", () => {
    const withId = fixture.replace("[right, 2026-07-12 09:12]", "[right, 2026-07-12 09:12, id=msg-123]");
    const result = parseConversation(withId, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" });
    expect(result.messages[0].timestamp).toBe("2026-07-12 09:12");
    expect(replaceMessage(withId, 0, "Still editable.")).toContain("[right, 2026-07-12 09:12, id=msg-123]");
  });

  it("writes new messages as readable Markdown while retaining machine-safe identity", () => {
    const written = appendMessageTransaction(fixture, {
      side: "right",
      nextSide: "left",
      timestamp: "2026-09-02 10:30",
      message: "Here is the plan.\n\n[Open the brief](Test.attachments/brief.pdf)",
      messageId: "msg-readable-1",
      conversationId: "conversation-readable",
      senderName: "Me",
      leftName: "Future Me",
      rightName: "Me",
      attachmentFolder: "Solomon Conversations/Test.attachments",
    });
    expect(written).toContain("### Me · 2026-09-02 10:30");
    expect(written).toContain("<!-- solomon-chat:right|2026-09-02 10:30|msg-readable-1 -->");
    expect(written).toContain("next-side: left");
    const parsed = parseConversation(written, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" });
    expect(parsed.messages.at(-1)).toEqual({
      id: "msg-readable-1",
      side: "right",
      timestamp: "2026-09-02 10:30",
      content: "Here is the plan.\n\n[Open the brief](Test.attachments/brief.pdf)",
    });
    const edited = replaceMessage(written, 2, "Updated without losing the heading.");
    expect(edited).toContain("### Me · 2026-09-02 10:30");
    expect(parseConversation(edited, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" }).messages.at(-1)?.content).toBe("Updated without losing the heading.");
  });

  it("keeps file frontmatter authoritative when Obsidian's metadata cache lags", () => {
    const written = appendMessageTransaction(fixture, {
      side: "right", nextSide: "left", timestamp: "2026-09-02 10:31", message: "Atomic send.",
      messageId: "msg-atomic", conversationId: "conversation-atomic", senderName: "Me", leftName: "Future Me", rightName: "Me", attachmentFolder: "Solomon Conversations/Test.attachments",
    });
    const parsed = parseConversation(written, { "next-side": "right" }, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" });
    expect(parsed.nextSide).toBe("left");
    expect(parsed.messages.at(-1)?.content).toBe("Atomic send.");
  });

  it("continues to parse the initial verbose HTML marker format", () => {
    const content = `${fixture}\n<!-- solomon-chat-message: left | 2026-09-02 10:32 | msg-verbose -->\n### Future Me · 2026-09-02 10:32\n\nStill readable.\n`;
    expect(parseConversation(content, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" }).messages.at(-1)).toEqual({
      id: "msg-verbose", side: "left", timestamp: "2026-09-02 10:32", content: "Still readable.",
    });
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

  it("targets a modern message by durable ID after another message is inserted before it", () => {
    const first = appendMessageTransaction(fixture, {
      side: "right", nextSide: "left", timestamp: "2026-09-02 10:31", message: "Target me.",
      messageId: "msg-target", conversationId: "conversation-atomic", senderName: "Me", leftName: "Future Me", rightName: "Me", attachmentFolder: "Solomon Conversations/Test.attachments",
    });
    const target = parseConversation(first, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" }).messages.at(-1)!;
    const concurrentlyChanged = first.replace("[right, 2026-07-12 09:12]", "[left, 2026-07-12 09:11]\nInserted earlier.\n\n[right, 2026-07-12 09:12]");
    const edited = replaceTargetMessage(concurrentlyChanged, target, "Correct target.");
    expect(edited).toContain("Inserted earlier.");
    expect(edited).toContain("Correct target.");
    expect(edited).not.toContain("Target me.");
  });

  it("refuses to guess when a legacy message target is ambiguous", () => {
    const duplicate = `${fixture.trimEnd()}\n\n[right, 2026-07-12 09:12]\nToday felt heavy.\n`;
    const target = parseConversation(fixture, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" }).messages[0];
    expect(() => replaceTargetMessage(duplicate, target, null)).toThrow("message changed");
  });

  it("refuses stale or duplicate modern IDs", () => {
    const written = appendMessageTransaction(fixture, {
      side: "right", nextSide: "left", timestamp: "2026-09-02 10:31", message: "Original content.",
      messageId: "msg-target", conversationId: "conversation-atomic", senderName: "Me", leftName: "Future Me", rightName: "Me", attachmentFolder: "Solomon Conversations/Test.attachments",
    });
    const target = parseConversation(written, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" }).messages.at(-1)!;
    expect(() => replaceTargetMessage(written.replace("Original content.", "Changed elsewhere."), target, "Overwrite")).toThrow("message changed");
    const duplicated = `${written.trimEnd()}\n\n<!-- solomon-chat:right|2026-09-02 10:32|msg-target -->\n### Me · 2026-09-02 10:32\n\nDuplicate ID.\n`;
    expect(() => replaceTargetMessage(duplicated, target, null)).toThrow("message changed");
  });

  it("preserves unrelated Markdown whitespace during an edit", () => {
    const content = `${fixture.trimEnd()}\n\n\`\`\`text\nline one\n\n\nline four\n\`\`\`\n`;
    const untouchedTail = content.slice(content.indexOf("```text"));
    const edited = replaceMessage(content, 0, "Updated thought.");
    expect(edited.slice(edited.indexOf("```text"))).toBe(untouchedTail);
    expect(edited).toContain("Updated thought.");
  });

  it("treats marker-looking lines inside fenced code as message content", () => {
    const content = `${fixture.trimEnd()}\n\n<!-- solomon-chat:right|2026-09-02 11:00|msg-fenced -->\n### Me · 2026-09-02 11:00\n\nBefore the fence.\n\n\`\`\`text\n[left, 1999-01-01 00:00]\n<!-- solomon-chat:left|1999-01-01 00:01|not-a-message -->\n\`\`\`\n\nAfter the fence.\n\n<!-- solomon-chat:left|2026-09-02 11:01|msg-real -->\n### Future Me · 2026-09-02 11:01\n\nA real next message.\n`;
    const parsed = parseConversation(content, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" });
    expect(parsed.messages).toHaveLength(4);
    expect(parsed.messages[2].content).toContain("[left, 1999-01-01 00:00]");
    expect(parsed.messages[2].content).toContain("not-a-message");
    expect(parsed.messages[2].content).toContain("After the fence.");
    expect(parsed.messages[3].id).toBe("msg-real");
    const edited = replaceTargetMessage(content, parsed.messages[2], "Updated fenced-message body.");
    const reparsed = parseConversation(edited, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" });
    expect(reparsed.messages).toHaveLength(4);
    expect(reparsed.messages[2].content).toBe("Updated fenced-message body.");
    expect(reparsed.messages[3].content).toBe("A real next message.");
  });

  it("does not activate an ordinary note from a marker inside a code fence", () => {
    const note = `---\nleft-name: Not a conversation\n---\n\n\`\`\`md\n[right, 2026-09-02 11:00]\n\`\`\`\n`;
    expect(parseConversation(note, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" }).isConversation).toBe(false);
  });

  it("finds a committed operation ID without accepting fenced lookalikes", () => {
    const content = `${fixture.trimEnd()}\n\n\`\`\`md\n<!-- solomon-chat:right|2026-09-02 11:00|msg-fenced-only -->\n\`\`\`\n\n<!-- solomon-chat:right|2026-09-02 11:01|msg-committed -->\n### Me · 2026-09-02 11:01\n\nCommitted once.\n`;
    expect(hasMessageId(content, "msg-fenced-only")).toBe(false);
    expect(hasMessageId(content, "msg-committed")).toBe(true);
  });

  it("does not activate on an ordinary note", () => {
    expect(parseConversation("# Journal\n\nHello", {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" }).isConversation).toBe(false);
  });
});
