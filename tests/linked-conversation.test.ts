import { describe, expect, it } from "vitest";
import type { Editor, EditorPosition, MarkdownView, TFile } from "obsidian";
import { captureLinkedConversationSource, insertLinkedConversationLink, isLinkedConversationSourceCurrent } from "../src/linked-conversation";

function sourceView() {
  let text = "Before after";
  let cursor = { line: 0, ch: 7 };
  const editor = {
    getValue: () => text,
    getCursor: () => cursor,
    replaceRange: (replacement: string, from: EditorPosition) => {
      text = text.slice(0, from.ch) + replacement + text.slice(from.ch);
    }
  } as unknown as Editor;
  const view = {
    file: { path: "Notes/Source.md" } as TFile,
    editor,
    containerEl: { isConnected: true } as HTMLElement
  } as Pick<MarkdownView, "file" | "editor" | "containerEl">;
  return { view, text: () => text, changeText: (value: string) => { text = value; }, moveCursor: () => { cursor.ch = 0; } };
}

describe("linked conversation source", () => {
  it("inserts the supplied native link at the captured cursor, not the current cursor", () => {
    const fake = sourceView();
    const source = captureLinkedConversationSource(fake.view)!;
    fake.moveCursor();
    expect(source.sourcePath).toBe("Notes/Source.md");
    expect(insertLinkedConversationLink(source, "[[Chat]]")).toBe(true);
    expect(fake.text()).toBe("Before [[Chat]]after");
  });

  it("preserves generated Markdown links instead of forcing wiki syntax", () => {
    const fake = sourceView();
    expect(insertLinkedConversationLink(captureLinkedConversationSource(fake.view)!, "[Chat](../Chats/Chat.md)")).toBe(true);
    expect(fake.text()).toBe("Before [Chat](../Chats/Chat.md)after");
  });

  it("does not capture an unsaved or closed source", () => {
    const fake = sourceView();
    fake.view.file = null;
    expect(captureLinkedConversationSource(fake.view)).toBeNull();
  });

  it.each(["text", "file", "rename", "editor", "closed"])("rejects a stale %s source before insertion", (change) => {
    const fake = sourceView();
    const source = captureLinkedConversationSource(fake.view)!;
    if (change === "text") fake.changeText("User changed the note");
    if (change === "file") fake.view.file = { path: "Notes/Other.md" } as TFile;
    if (change === "rename") fake.view.file!.path = "Notes/Renamed.md";
    if (change === "editor") fake.view.editor = {} as Editor;
    if (change === "closed") fake.view.containerEl = { isConnected: false } as HTMLElement;
    const before = fake.text();
    expect(isLinkedConversationSourceCurrent(source)).toBe(false);
    expect(insertLinkedConversationLink(source, "[[Chat]]")).toBe(false);
    expect(fake.text()).toBe(before);
  });

  it("cannot insert the same link twice through the original snapshot", () => {
    const fake = sourceView();
    const source = captureLinkedConversationSource(fake.view)!;
    expect(insertLinkedConversationLink(source, "[[Chat]]")).toBe(true);
    expect(insertLinkedConversationLink(source, "[[Chat]]")).toBe(false);
    expect(fake.text()).toBe("Before [[Chat]]after");
  });
});
