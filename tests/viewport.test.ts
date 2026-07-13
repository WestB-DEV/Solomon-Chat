import { describe, expect, it } from "vitest";
import { calculateViewportLayout } from "../src/viewport";

describe("mobile viewport layout", () => {
  it("uses native toolbar clearance when the keyboard is closed", () => {
    expect(calculateViewportLayout({ mobile: true, focused: false, layoutHeight: 844, visualHeight: 844, visualOffsetTop: 0, containerBottom: 790, closedToolbarClearance: 54 })).toEqual({ keyboardOpen: false, composeMode: false, bottomClearance: 54 });
  });

  it("anchors to the iPhone visual viewport while focused", () => {
    expect(calculateViewportLayout({ mobile: true, focused: true, layoutHeight: 844, visualHeight: 510, visualOffsetTop: 0, containerBottom: 790, closedToolbarClearance: 54 })).toEqual({ keyboardOpen: true, composeMode: true, bottomClearance: 280 });
  });

  it("handles an Android visual viewport offset", () => {
    expect(calculateViewportLayout({ mobile: true, focused: true, layoutHeight: 915, visualHeight: 560, visualOffsetTop: 24, containerBottom: 870, closedToolbarClearance: 56 })).toEqual({ keyboardOpen: true, composeMode: true, bottomClearance: 286 });
  });

  it("allows Android shells that resize the layout viewport to handle the keyboard natively", () => {
    expect(calculateViewportLayout({ mobile: true, focused: true, layoutHeight: 560, visualHeight: 560, visualOffsetTop: 0, containerBottom: 560, closedToolbarClearance: 0 })).toEqual({ keyboardOpen: false, composeMode: true, bottomClearance: 0 });
  });

  it("never enters mobile compose mode on desktop", () => {
    expect(calculateViewportLayout({ mobile: false, focused: true, layoutHeight: 900, visualHeight: 500, visualOffsetTop: 0, containerBottom: 850, closedToolbarClearance: 0 })).toEqual({ keyboardOpen: false, composeMode: false, bottomClearance: 0 });
  });
});
