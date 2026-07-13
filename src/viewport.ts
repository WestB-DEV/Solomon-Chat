export interface ViewportInput {
  mobile: boolean;
  focused: boolean;
  layoutHeight: number;
  visualHeight: number;
  visualOffsetTop: number;
  containerBottom: number;
  closedToolbarClearance: number;
}

export interface ViewportLayout {
  keyboardOpen: boolean;
  composeMode: boolean;
  bottomClearance: number;
}

/** Pure layout calculation kept separate so iOS/Android viewport cases can be regression-tested. */
export function calculateViewportLayout(input: ViewportInput): ViewportLayout {
  if (!input.mobile) return { keyboardOpen: false, composeMode: false, bottomClearance: 0 };
  const keyboardDelta = Math.max(0, input.layoutHeight - input.visualHeight - input.visualOffsetTop);
  const keyboardOpen = input.focused && keyboardDelta > 100;
  const visibleBottom = input.visualOffsetTop + input.visualHeight;
  const keyboardClearance = Math.max(0, input.containerBottom - visibleBottom);
  return {
    keyboardOpen,
    composeMode: input.focused,
    bottomClearance: keyboardOpen ? Math.round(keyboardClearance) : Math.max(0, input.closedToolbarClearance),
  };
}
