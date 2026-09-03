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
  // Some Android Obsidian/WebView combinations resize the plugin container while
  // leaving both innerHeight and visualViewport unchanged. In that mode the host
  // has already cleared the keyboard, so retaining the closed toolbar inset would
  // create a large, duplicate gap above the IME.
  const keyboardHandledByHost = input.focused && !keyboardOpen && visibleBottom - input.containerBottom > 100;
  return {
    keyboardOpen,
    composeMode: input.focused,
    bottomClearance: keyboardOpen
      ? Math.round(keyboardClearance)
      : keyboardHandledByHost
        ? 0
        : Math.max(0, input.closedToolbarClearance),
  };
}
