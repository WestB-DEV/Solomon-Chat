import { describe, expect, it } from "vitest";
import { calculateViewportLayout } from "../src/viewport";

describe("mobile viewport layout", () => {
  it("uses native toolbar clearance when the keyboard is closed", () => {
    expect(calculateViewportLayout({ mobile: true, focused: false, layoutHeight: 844, visualHeight: 844, visualOffsetTop: 0, containerBottom: 790, closedToolbarClearance: 54 })).toEqual({ keyboardOpen: false, composeMode: false, bottomClearance: 54 });
  });

  it("anchors to the iPhone visual viewport while focused", () => {
    expect(calculateViewportLayout({ mobile: true, focused: true, layoutHeight: 844, visualHeight: 510, visualOffsetTop: 0, containerBottom: 790, closedToolbarClearance: 54 })).toEqual({ keyboardOpen: true, composeMode: true, bottomClearance: 280 });
  });

  it("does not cap a short iPhone landscape keyboard at half the container", () => {
    expect(calculateViewportLayout({ mobile: true, focused: true, layoutHeight: 390, visualHeight: 145, visualOffsetTop: 0, containerBottom: 360, closedToolbarClearance: 44 }).bottomClearance).toBe(215);
  });

  it("recomputes cleanly over repeated open-close and rotation samples", () => {
    const samples = [
      { focused: true, layoutHeight: 844, visualHeight: 510, containerBottom: 790 },
      { focused: false, layoutHeight: 844, visualHeight: 844, containerBottom: 790 },
      { focused: true, layoutHeight: 390, visualHeight: 145, containerBottom: 360 },
      { focused: false, layoutHeight: 390, visualHeight: 390, containerBottom: 360 },
      { focused: true, layoutHeight: 844, visualHeight: 510, containerBottom: 790 },
    ].map((sample) => calculateViewportLayout({ mobile: true, visualOffsetTop: 0, closedToolbarClearance: 44, ...sample }));
    expect(samples.map((sample) => sample.bottomClearance)).toEqual([280, 44, 215, 44, 280]);
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
