import { describe, expect, it } from "vitest";
import { draftKey, movePathDraft, movePathPendingCleanups, parseDraftMap, parsePendingCleanupMap } from "../src/drafts";

describe("durable drafts", () => {
  it("uses stable conversation identity when available", () => {
    expect(draftKey("conversation-123", "Old name.md")).toBe("conversation:conversation-123");
    expect(draftKey("", "Solomon Conversations/Old name.md")).toBe("path:Solomon Conversations/Old name.md");
  });

  it("keeps a legacy path-keyed draft with its renamed note", () => {
    const drafts = { "path:Old.md": { version: 1 as const, text: "Do not lose this.", updatedAt: 42 } };
    expect(movePathDraft(drafts, "Old.md", "Renamed.md")).toBe(true);
    expect(drafts).toEqual({ "path:Renamed.md": { version: 1, text: "Do not lose this.", updatedAt: 42 } });
  });

  it("rejects malformed persisted records without discarding valid drafts", () => {
    expect(parseDraftMap({
      good: { version: 1, text: "Exact draft", updatedAt: 100 },
      sending: { version: 1, text: "Being sent", updatedAt: 101, sendingMessageId: "msg-123" },
      attachmentOnly: { version: 1, text: "", updatedAt: 102, sendingMessageId: "msg-attachment" },
      old: { version: 0, text: "Old", updatedAt: 50 },
      empty: { version: 1, text: "", updatedAt: 100 },
      broken: "draft",
    })).toEqual({
      good: { version: 1, text: "Exact draft", updatedAt: 100 },
      sending: { version: 1, text: "Being sent", updatedAt: 101, sendingMessageId: "msg-123" },
      attachmentOnly: { version: 1, text: "", updatedAt: 102, sendingMessageId: "msg-attachment" },
    });
  });

  it("keeps only generated message IDs in the separate cleanup ledger", () => {
    expect(parsePendingCleanupMap({
      conversation: ["msg-0123456789abcdef", "msg-0123456789abcdef", "msg-archive", "../../Important"],
      malformed: "msg-fedcba9876543210",
    })).toEqual({ conversation: ["msg-0123456789abcdef"] });
  });

  it("moves a path-keyed cleanup ledger without losing destination entries", () => {
    const cleanups = { "path:Old.md": ["msg-0123456789abcdef"], "path:New.md": ["msg-fedcba9876543210"] };
    expect(movePathPendingCleanups(cleanups, "Old.md", "New.md")).toBe(true);
    expect(cleanups).toEqual({ "path:New.md": ["msg-fedcba9876543210", "msg-0123456789abcdef"] });
  });
});
