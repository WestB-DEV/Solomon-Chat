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

export type EffectiveViewportLayout = ViewportLayout;

/** Convert a host-reported keyboard height into the portion that actually occludes the current leaf. */
export function calculateNativeKeyboardOcclusion(containerBottom: number, layoutHeight: number, keyboardHeight: number): number {
  const keyboardTop = layoutHeight - Math.max(0, keyboardHeight);
  return Math.max(0, Math.round(containerBottom - keyboardTop));
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

/** Reconcile viewport and native signals without allowing a stale visual viewport to defeat a native hide event. */
export function resolveViewportLayout(
  layout: ViewportLayout,
  nativeKeyboardOpen: boolean,
  nativeOcclusion: number,
  forceKeyboardClosed: boolean,
  closedToolbarClearance: number,
): EffectiveViewportLayout {
  if (forceKeyboardClosed) {
    return {
      keyboardOpen: false,
      composeMode: layout.composeMode,
      bottomClearance: Math.max(0, closedToolbarClearance),
    };
  }
  return {
    keyboardOpen: layout.keyboardOpen || nativeKeyboardOpen,
    composeMode: layout.composeMode || nativeKeyboardOpen,
    bottomClearance: Math.max(layout.bottomClearance, nativeOcclusion),
  };
}
