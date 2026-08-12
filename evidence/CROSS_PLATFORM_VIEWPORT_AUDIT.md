# Cross-platform viewport audit

## Universal baseline

- Solomon owns a bounded shell inside Obsidian's real `.view-content`: flex column host, `min-height: 0`, `overflow: hidden`, and a three-row grid (`header`, scrollable transcript, normal-flow composer).
- `window.visualViewport.height` and `offsetTop` are read on both `resize` and `scroll`, batched with `requestAnimationFrame`, and read again after a 160 ms settle window. This covers iOS Safari/WebView keyboard pan/resize transitions without fixed keyboard dimensions.
- A `ResizeObserver` watches the actual Obsidian content host. Leaf resizing, mobile chrome changes, split changes, and rotation therefore rerun the same geometry path.
- Safe-area inset is applied once at the root through `env(safe-area-inset-bottom, 0px)`. Measured host-chrome clearance and the safe-area inset use `max()`, not addition, avoiding double counting.
- The layout does not depend on `dvh`/`svh`. Older embedded WebViews therefore keep the host-bounded flex/grid fallback; newer engines still use VisualViewport for the actual visible rectangle.

## Host chrome and keyboard adapters

- Obsidian's bottom navigation is discovered from fixed/sticky elements intersecting the content leaf. The plugin does not encode the toolbar height or an Android navigation offset.
- Capacitor's native keyboard event is an isolated embedded-host fallback for Android WebViews that do not resize VisualViewport. It supplies the measured keyboard height from the host API; no device-specific constants are used.
- `interactive-widget=resizes-content`, VirtualKeyboard overlays, and `keyboard-inset-*` are deliberately not required because a plugin does not own Obsidian's top-level viewport and iOS does not provide equivalent support.

## iOS regression risk

- Expected low-risk path: iOS VisualViewport resize/scroll plus safe-area inset drives the universal calculation; the composer grid itself is platform-neutral.
- Remaining release gate: a physical iPhone must still verify focus, dismiss, reopen, rotation, browser/app chrome transitions, and attachment return. Android-emulator PASS is not represented as physical-iOS proof.
