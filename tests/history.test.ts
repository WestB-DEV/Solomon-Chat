import { describe, expect, it } from "vitest";
import { earlierMessageCount, initialVisibleStart, previousVisibleStart } from "../src/history";

describe("long conversation history windows", () => {
  it("renders every short conversation", () => {
    expect(initialVisibleStart(75)).toBe(0);
  });

  it("bounds a large initial render to the latest 200 messages", () => {
    expect(initialVisibleStart(2_000)).toBe(1_800);
    expect(earlierMessageCount(1_800)).toBe(1_800);
  });

  it("loads earlier history in stable batches", () => {
    expect(previousVisibleStart(1_800)).toBe(1_600);
    expect(previousVisibleStart(125)).toBe(0);
  });
});
