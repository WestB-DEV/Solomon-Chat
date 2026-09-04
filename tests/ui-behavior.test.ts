import { describe, expect, it } from "vitest";
import { shouldRouteToChat, shouldSubmitComposerKey } from "../src/ui-behavior";

describe("chat view routing", () => {
  it("routes a recognized conversation from Markdown", () => {
    expect(shouldRouteToChat({ conversation: true, filePath: "Chats/Test.md", markdownView: true, routing: false })).toBe(true);
  });

  it("leaves ordinary Markdown and non-Markdown views alone", () => {
    expect(shouldRouteToChat({ conversation: false, filePath: "Notes/Test.md", markdownView: true, routing: false })).toBe(false);
    expect(shouldRouteToChat({ conversation: true, filePath: "Chats/Test.md", markdownView: false, routing: false })).toBe(false);
  });

  it("respects the raw Markdown escape and routing guard", () => {
    expect(shouldRouteToChat({ conversation: true, filePath: "Chats/Test.md", markdownView: true, rawPath: "Chats/Test.md", routing: false })).toBe(false);
    expect(shouldRouteToChat({ conversation: true, filePath: "Chats/Test.md", markdownView: true, routing: true })).toBe(false);
  });
});

describe("composer keyboard behavior", () => {
  it("sends on unmodified desktop Enter", () => {
    expect(shouldSubmitComposerKey({ composing: false, key: "Enter", mobile: false, shift: false })).toBe(true);
  });

  it("preserves mobile Enter, Shift+Enter, and IME composition", () => {
    expect(shouldSubmitComposerKey({ composing: false, key: "Enter", mobile: true, shift: false })).toBe(false);
    expect(shouldSubmitComposerKey({ composing: false, key: "Enter", mobile: false, shift: true })).toBe(false);
    expect(shouldSubmitComposerKey({ composing: true, key: "Enter", mobile: false, shift: false })).toBe(false);
  });
});
