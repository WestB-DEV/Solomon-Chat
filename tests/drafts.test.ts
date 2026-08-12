import { describe, expect, it } from "vitest";
import { draftKey, moveDraft, normalizeDraftEnvelope, upsertDraft } from "../src/drafts";

describe("durable drafts", () => {
  it("round-trips exact multiline Unicode text and attachments", () => {
    const draft = { conversationId: "conv-1", filePath: "Chats/A.md", text: "line 1\n🙂 e\u0301", attachmentPaths: ["Chats/A.attachments/photo.heic"], updatedAt: 42 };
    const saved = upsertDraft({ version: 1, drafts: {} }, draft);
    expect(normalizeDraftEnvelope(JSON.parse(JSON.stringify(saved))).drafts[draftKey("conv-1", "Chats/A.md")]).toEqual(draft);
  });

  it("follows a stable conversation identity across rename", () => {
    const original = upsertDraft({ version: 1, drafts: {} }, { conversationId: "conv-1", filePath: "Old.md", text: "keep me", attachmentPaths: [], updatedAt: 1 });
    const moved = moveDraft(original, "conv-1", "Old.md", "conv-1", "New.md");
    expect(moved.drafts[draftKey("conv-1", "New.md")]?.text).toBe("keep me");
  });

  it("removes a draft only when both text and attachments are empty", () => {
    const withText = upsertDraft({ version: 1, drafts: {} }, { conversationId: "conv", filePath: "A.md", text: "x", attachmentPaths: [], updatedAt: 1 });
    expect(Object.keys(upsertDraft(withText, { conversationId: "conv", filePath: "A.md", text: "", attachmentPaths: [], updatedAt: 2 }).drafts)).toHaveLength(0);
  });
});
