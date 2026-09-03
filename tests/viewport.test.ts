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

  it("keeps the full keyboard clearance in a short landscape viewport", () => {
    expect(calculateViewportLayout({ mobile: true, focused: true, layoutHeight: 430, visualHeight: 180, visualOffsetTop: 0, containerBottom: 410, closedToolbarClearance: 0 })).toEqual({ keyboardOpen: true, composeMode: true, bottomClearance: 230 });
  });

  it("never applies more keyboard clearance than the container geometry requires", () => {
    expect(calculateViewportLayout({ mobile: true, focused: true, layoutHeight: 844, visualHeight: 420, visualOffsetTop: 18, containerBottom: 780, closedToolbarClearance: 54 })).toEqual({ keyboardOpen: true, composeMode: true, bottomClearance: 342 });
  });

  it("tracks the iPhone visual viewport after rotating into landscape", () => {
    expect(calculateViewportLayout({ mobile: true, focused: true, layoutHeight: 390, visualHeight: 210, visualOffsetTop: 0, containerBottom: 390, closedToolbarClearance: 54 })).toEqual({ keyboardOpen: true, composeMode: true, bottomClearance: 180 });
  });

  it("does not mistake a small focused viewport change for the software keyboard", () => {
    expect(calculateViewportLayout({ mobile: true, focused: true, layoutHeight: 844, visualHeight: 790, visualOffsetTop: 0, containerBottom: 790, closedToolbarClearance: 54 })).toEqual({ keyboardOpen: false, composeMode: true, bottomClearance: 54 });
  });

  it("is deterministic across repeated iPhone keyboard and rotation cycles", () => {
    const portraitOpen = { mobile: true, focused: true, layoutHeight: 844, visualHeight: 510, visualOffsetTop: 0, containerBottom: 790, closedToolbarClearance: 54 };
    const landscapeOpen = { mobile: true, focused: true, layoutHeight: 390, visualHeight: 210, visualOffsetTop: 0, containerBottom: 390, closedToolbarClearance: 54 };
    const closed = { mobile: true, focused: false, layoutHeight: 844, visualHeight: 844, visualOffsetTop: 0, containerBottom: 790, closedToolbarClearance: 54 };
    expect([portraitOpen, closed, landscapeOpen, portraitOpen, closed].map(calculateViewportLayout)).toEqual([
      { keyboardOpen: true, composeMode: true, bottomClearance: 280 },
      { keyboardOpen: false, composeMode: false, bottomClearance: 54 },
      { keyboardOpen: true, composeMode: true, bottomClearance: 180 },
      { keyboardOpen: true, composeMode: true, bottomClearance: 280 },
      { keyboardOpen: false, composeMode: false, bottomClearance: 54 },
    ]);
  });

  it("allows Android shells that resize the layout viewport to handle the keyboard natively", () => {
    expect(calculateViewportLayout({ mobile: true, focused: true, layoutHeight: 560, visualHeight: 560, visualOffsetTop: 0, containerBottom: 560, closedToolbarClearance: 0 })).toEqual({ keyboardOpen: false, composeMode: true, bottomClearance: 0 });
  });

  it("does not stack toolbar clearance when Android shrinks only the plugin container", () => {
    expect(calculateViewportLayout({ mobile: true, focused: true, layoutHeight: 807, visualHeight: 807, visualOffsetTop: 0, containerBottom: 508, closedToolbarClearance: 80 })).toEqual({ keyboardOpen: false, composeMode: true, bottomClearance: 0 });
  });

  it("never enters mobile compose mode on desktop", () => {
    expect(calculateViewportLayout({ mobile: false, focused: true, layoutHeight: 900, visualHeight: 500, visualOffsetTop: 0, containerBottom: 850, closedToolbarClearance: 0 })).toEqual({ keyboardOpen: false, composeMode: false, bottomClearance: 0 });
  });
});
