import { calculateViewportLayout } from "../src/viewport";

const query = new URLSearchParams(location.search);
const android = query.get("device") === "android";
const desktop = query.get("device") === "desktop";
const capture = query.get("capture") === "1";
const keyboardHeight = android ? 355 : 334;
const deviceHeight = android ? 915 : 844;
const toolbarHeight = android ? 56 : 54;
const root = document.querySelector<HTMLElement>(".solomon-chat-root")!;
const keyboard = document.querySelector<HTMLElement>(".keyboard")!;
const toolbar = document.querySelector<HTMLElement>(".mobile-toolbar")!;
const textarea = document.querySelector<HTMLTextAreaElement>("textarea")!;
const toggle = document.querySelector<HTMLButtonElement>("#keyboard-toggle")!;
const metrics = document.querySelector<HTMLElement>("#metrics")!;
document.body.classList.toggle("is-capture", capture);
document.body.classList.toggle("is-desktop", desktop);
document.body.classList.toggle("is-phone-capture", capture && !desktop);
document.querySelector<HTMLElement>("#device-label")!.textContent = desktop ? "Desktop" : android ? "Pixel 9" : "iPhone 15";
let open = query.get("keyboard") === "open";

function render(): void {
  const visibleHeight = open ? deviceHeight - keyboardHeight : deviceHeight;
  const layout = calculateViewportLayout({ mobile: !desktop, focused: open, layoutHeight: deviceHeight, visualHeight: visibleHeight, visualOffsetTop: android ? 24 : 0, containerBottom: deviceHeight, closedToolbarClearance: toolbarHeight });
  root.classList.toggle("is-compose-mode", layout.composeMode);
  root.classList.toggle("is-keyboard-open", layout.keyboardOpen);
  root.style.setProperty("--solomon-bottom-clearance", `${layout.bottomClearance}px`);
  keyboard.classList.toggle("is-open", open); toolbar.style.display = open ? "none" : "flex";
  toggle.ariaPressed = String(open); toggle.textContent = open ? "Close keyboard" : "Open keyboard";
  metrics.textContent = `visual ${visibleHeight}px · clearance ${layout.bottomClearance}px`;
  if (open) textarea.focus(); else textarea.blur();
}
toggle.addEventListener("click", () => { open = !open; render(); });
textarea.addEventListener("focus", () => { if (!open) { open = true; render(); } });
render();
