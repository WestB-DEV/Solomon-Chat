import { describe, expect, it } from "vitest";
import {
  CONTINUATION_SOFT_BYTE_LIMIT,
  CONTINUATION_SOFT_MESSAGE_LIMIT,
  assessContinuationRollover,
  applyContinuationRepair,
  buildContinuationSegment,
  continuationFileName,
  parseContinuationSegment,
  planContinuationRepairs,
} from "../src/continuation";

describe("native Obsidian continuation chains", () => {
  it("uses deterministic same-directory names and ordinary wikilinks", () => {
    expect(continuationFileName("My Conversation.md", 1)).toBe("My Conversation.md");
    expect(continuationFileName("My Conversation", 2)).toBe("My Conversation — Part 002.md");
    expect(() => continuationFileName("folder/My Conversation", 2)).toThrow(/same-directory/);

    const first = buildContinuationSegment({
      baseName: "My Conversation",
      conversationId: "conversation-7",
      segmentIndex: 1,
      messageMarkdown: "[right, 2026-08-11 09:00]\nOnly stored here.",
      hasNext: true,
    });
    const second = buildContinuationSegment({
      baseName: "My Conversation",
      conversationId: "conversation-7",
      segmentIndex: 2,
      messageMarkdown: "[left, 2026-08-11 09:01]\nOnly stored there.",
    });
    expect(first.content).toContain('next_segment: "[[My Conversation — Part 002]]"');
    expect(first.content).toContain("> Continue: [[My Conversation — Part 002]] →");
    expect(second.content).toContain('prev_segment: "[[My Conversation]]"');
    expect(second.content).toContain("> ← Previous: [[My Conversation]]");
    expect(first.content).not.toContain("Only stored there.");
    expect(second.content).not.toContain("Only stored here.");

    const parsed = parseContinuationSegment(second);
    expect(parsed).toMatchObject({
      conversationId: "conversation-7",
      segmentIndex: 2,
      previousSegment: "My Conversation.md",
      visiblePreviousSegment: "My Conversation.md",
      messageMarkdown: "[left, 2026-08-11 09:01]\nOnly stored there.",
    });
  });

  it("reads legacy property aliases without rewriting message truth", () => {
    const legacy = {
      fileName: "Legacy — Part 002.md",
      content: `---\nconversation-id: old-stable-id\nsegment-index: 2\nprevious-segment: "[[Legacy]]"\n---\n\n[previous segment] [[Legacy]]\n\n[right, now]\nLegacy body.\n`,
    };
    expect(parseContinuationSegment(legacy)).toMatchObject({
      conversationId: "old-stable-id",
      segmentIndex: 2,
      previousSegment: "Legacy.md",
      messageMarkdown: "[previous segment] [[Legacy]]\n\n[right, now]\nLegacy body.",
    });
  });

  it("offers, but does not force, rollover at either soft threshold using UTF-8 bytes", () => {
    const under = assessContinuationRollover("🙂", 1);
    expect(under).toMatchObject({ byteCount: 4, shouldOfferContinuation: false });

    const byBytes = assessContinuationRollover("🙂".repeat(CONTINUATION_SOFT_BYTE_LIMIT / 4), 1);
    expect(byBytes).toMatchObject({ shouldOfferContinuation: true, reasons: ["bytes"] });

    const byMessages = assessContinuationRollover("tiny", CONTINUATION_SOFT_MESSAGE_LIMIT);
    expect(byMessages).toMatchObject({ shouldOfferContinuation: true, reasons: ["messages"] });
    expect(byMessages).not.toHaveProperty("mustContinue");
  });

  it("detects and plans repairs for one-sided metadata and visible links", () => {
    const first = buildContinuationSegment({
      baseName: "Repairable",
      conversationId: "repair-id",
      segmentIndex: 1,
      messageMarkdown: "[right, t]\nFirst truth.",
      hasNext: true,
    });
    const second = buildContinuationSegment({
      baseName: "Repairable",
      conversationId: "repair-id",
      segmentIndex: 2,
      messageMarkdown: "[left, t]\nSecond truth.",
    });
    const crashedSecond = {
      ...second,
      content: second.content
        .replace(/prev_segment:.*\n/, "")
        .replace(/<!-- solomon-continuation-top -->[\s\S]*?<!-- \/solomon-continuation-top -->\n*/, ""),
    };
    const plan = planContinuationRepairs([first, crashedSecond]);
    expect(plan.issues).toEqual([
      {
        fileName: "Repairable — Part 002.md",
        field: "previous",
        expected: "Repairable.md",
        metadataActual: null,
        visibleActual: null,
      },
    ]);
    expect(plan.repairs).toHaveLength(1);
    expect(plan.repairs[0].content).toContain('prev_segment: "[[Repairable]]"');
    expect(plan.repairs[0].content).toContain("> ← Previous: [[Repairable]]");
    expect(plan.repairs[0].content.match(/Second truth\./g)).toHaveLength(1);
    expect(planContinuationRepairs([first, { ...second, content: plan.repairs[0].content }]).issues).toEqual([]);
  });

  it("repairs navigation against the latest content without overwriting concurrent messages", () => {
    const initial = buildContinuationSegment({ baseName: "Concurrent", conversationId: "conv", segmentIndex: 1, messageMarkdown: "[right, t]\nOriginal." });
    const latest = initial.content.replace("Original.", "Original.\n\n[left, later]\nConcurrent edit.");
    const repaired = applyContinuationRepair(latest, null, "Concurrent — Part 002.md");
    expect(repaired).toContain("Concurrent edit.");
    expect(repaired).toContain("> Continue: [[Concurrent — Part 002]] →");
  });

  it("sustains 10 segments, 20,000 unique messages, and at least 2.5 MiB", () => {
    const segments = Array.from({ length: 10 }, (_, segmentOffset) => {
      const segmentIndex = segmentOffset + 1;
      const messages = Array.from({ length: 2_000 }, (_, messageOffset) => {
        const id = segmentOffset * 2_000 + messageOffset;
        return `[${id % 2 ? "left" : "right"}, t-${id}]\nmessage-${id.toString().padStart(5, "0")}: ${"x".repeat(110)}`;
      }).join("\n\n");
      return buildContinuationSegment({
        baseName: "Scale Conversation",
        conversationId: "scale-conversation",
        segmentIndex,
        messageMarkdown: messages,
        hasNext: segmentIndex < 10,
      });
    });

    expect(segments).toHaveLength(10);
    expect(segments.at(-1)?.fileName).toBe("Scale Conversation — Part 010.md");
    const totalBytes = segments.reduce((total, segment) => total + new TextEncoder().encode(segment.content).byteLength, 0);
    expect(totalBytes).toBeGreaterThanOrEqual(2.5 * 1024 * 1024);
    const ids = new Set<string>();
    let totalMessages = 0;
    for (const segment of segments) {
      const parsed = parseContinuationSegment(segment);
      expect(parsed).not.toBeNull();
      const markers = Array.from(parsed!.messageMarkdown.matchAll(/^message-(\d{5}):/gm));
      markers.forEach((match) => ids.add(match[1]));
      totalMessages += markers.length;
      expect(assessContinuationRollover(parsed!.messageMarkdown).shouldOfferContinuation).toBe(true);
    }
    expect(totalMessages).toBe(20_000);
    expect(ids.size).toBe(20_000);
    expect(planContinuationRepairs(segments).issues).toEqual([]);
  });
});
