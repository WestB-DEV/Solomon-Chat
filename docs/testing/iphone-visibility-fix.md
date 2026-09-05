# iPhone visibility and scrolling fix — private candidate

Date: 2026-09-04. Base: public 1.1.0 (`4bae8fe`). Branch: `fix/iphone-chat-visibility`.

## Changes and evidence

- Incremental rendering of the first message previously retained the empty-chat prompt. Remove it when the first message arrives.
- Track whether the reader is following the latest message. A duplicate render or burst of appends must not cancel that intent based on temporarily stale scroll geometry.
- Observe transcript and message sizes, maintaining the bottom position after viewport/composer resizing or delayed Markdown/media layout. Existing view teardown disconnects the observer; transcript rebuilds unobserve removed rows.
- Stop following when the reader scrolls into history; preserve their position on incoming messages. The Latest button and sending their own message resume following.
- Use immediate programmatic scrolling and prevent message flex shrinking.

The exact reported native iPhone upper-right overlay was not reproduced on a physical iPhone. The empty-state defect is confirmed, and the first bubble is contained below a simulated host header in the regression test. A separate iOS host-overlay issue remains possible.

## Validation

- TypeScript: pass.
- Existing unit tests: 42/42 pass.
- ESLint: no errors; existing settings-search compatibility warning remains.
- Production build: pass.
- Windows Microsoft Edge headless, actual production plugin bundle and CSS, minimal mocked Obsidian host/Markdown renderer: pass at 375×667, 390×844, 844×390, 430×915 (mobile flag), and 1280×900 (desktop flag).
- Each layout checks empty-to-first-message transition, bubble/header containment, rapid appends plus duplicate rendering, keyboard-sized host resize, delayed content growth, preserving older-message reading, Latest navigation, and own-send return to bottom.
- This is not native Obsidian, WebKit, physical iPhone, or Android device verification. Keyboard changes and delayed media growth are simulated. No release/publication performed.

The old temporary CSS-only test was discarded as evidence because its container was incorrectly sized. The committed regression executes the plugin's real rendering methods with a correctly sized host.

### Baseline validation follow-up

Compiled original `4bae8fe:src/plugin.ts` with esbuild against unchanged supporting modules and tested it with the same corrected host and current CSS (isolating JavaScript behavior). At 375×667 it fails `first append removes the empty prompt` (`empty: true`). Running the separate `SCENARIO=scroll` path also fails `append and duplicate render follow latest`. The fixed bundle passes both checks and the complete five-layout matrix, including sequential settled appends followed by a rapid batch and duplicate render.

Measured initial transcript client heights: 469, 646, 188, 717, and 720 pixels respectively. The harness now asserts a client height greater than 100 pixels. These results prove the prompt-removal and render-scroll regressions, not a physical iPhone header-overlap reproduction or a failing flex-shrink baseline.

To compare a separately built baseline, set `PLUGIN_BUNDLE` to its bundle path; set `SCENARIO=scroll` to continue past the known empty-prompt failure and independently test scrolling. Unset both for the full fixed-build test. Baseline runs do not overwrite the fixed screenshot.

## Reproduce on Windows

Build with `node esbuild.config.mjs production`. With Playwright available, run `node tests/chat-browser-regression.cjs`; set `PLAYWRIGHT_MODULE` to its installed module directory if it is not discoverable normally. Microsoft Edge must be installed. The fixture does not modify a vault or an existing browser session.

## Device acceptance before release

Install the private build into a test vault on iPhone. Create a chat and send the first message with the keyboard open and closed. Verify the full bubble clears the native header/actions. Send several messages; rotate; dismiss/reopen the keyboard; open an image-containing transcript. Latest must remain visible when following. Scroll up, receive/append a message, and verify history is not pulled down; tap Latest and send from history. Repeat the smoke test in native Windows and Android Obsidian. Do not release until these host/device checks are complete.
