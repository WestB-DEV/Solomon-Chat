import type { App } from "obsidian";
import { completeWikiLink, wikiLinkAtCursor } from "./wiki-links";

/** Textarea-compatible suggestions; target creation stays entirely with Obsidian. */
export function installLinkSuggestions(app: App, input: HTMLTextAreaElement, parent: HTMLElement, source: () => string, busy: () => boolean): () => void {
  const popup = parent.createDiv({ cls: "solomon-link-suggestions" });
  popup.id = `solomon-links-${Math.random().toString(36).slice(2)}`;
  popup.setAttribute("role", "listbox");
  popup.setAttribute("aria-label", "Link to a note");
  input.setAttribute("aria-controls", popup.id);
  input.setAttribute("aria-autocomplete", "list");
  let choices: { target: string; label: string }[] = [];
  let active = 0;
  const hide = () => { popup.hidden = true; input.removeAttribute("aria-activedescendant"); };
  const highlight = () => {
    Array.from(popup.children).forEach((el, i) => el.setAttribute("aria-selected", String(i === active)));
    input.setAttribute("aria-activedescendant", `${popup.id}-${active}`);
    popup.children[active]?.scrollIntoView({ block: "nearest" });
  };
  const select = (index: number) => {
    const range = wikiLinkAtCursor(input.value, input.selectionStart, input.selectionEnd);
    if (!range || busy() || !choices[index]) return;
    const result = completeWikiLink(input.value, range, choices[index].target);
    input.value = result.text;
    input.focus({ preventScroll: true });
    input.setSelectionRange(result.cursor, result.cursor);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    hide();
  };
  const update = () => {
    const range = wikiLinkAtCursor(input.value, input.selectionStart, input.selectionEnd);
    if (!range || busy() || input.ownerDocument.activeElement !== input) { hide(); return; }
    const query = range.query.trim();
    choices = app.vault.getMarkdownFiles().filter(file => file.path.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
      .sort((a, b) => a.path.localeCompare(b.path)).slice(0, 7)
      .map(file => ({ target: app.metadataCache.fileToLinktext(file, source(), true), label: file.path.replace(/\.md$/, "") }));
    if (query && !app.metadataCache.getFirstLinkpathDest(query, source())) {
      choices.unshift({ target: query, label: `${query} — create when opened` });
    }
    popup.empty(); active = 0;
    choices.forEach((choice, i) => {
      const row = popup.createDiv({ cls: "solomon-link-option", text: choice.label });
      row.id = `${popup.id}-${i}`; row.setAttribute("role", "option");
      row.addEventListener("pointerdown", event => event.preventDefault());
      let touchStart: { x: number; y: number } | undefined;
      row.addEventListener("touchstart", event => {
        if (event.touches.length !== 1) return;
        touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        event.stopPropagation();
      }, { passive: true });
      row.addEventListener("touchend", event => {
        const start = touchStart; touchStart = undefined;
        const touch = event.changedTouches[0];
        if (!start || !touch || Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 10) return;
        event.preventDefault(); event.stopPropagation(); select(i);
      }, { passive: false });
      row.addEventListener("touchcancel", () => { touchStart = undefined; });
      row.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); select(i); });
    });
    popup.hidden = !choices.length;
    if (choices.length) highlight();
  };
  hide();
  input.addEventListener("input", update);
  input.addEventListener("click", update);
  input.addEventListener("keyup", event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) update(); });
  input.addEventListener("blur", hide);
  input.addEventListener("keydown", event => {
    if (busy() || !wikiLinkAtCursor(input.value, input.selectionStart, input.selectionEnd)) { hide(); return; }
    if (popup.hidden || event.isComposing) return;
    if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.key === "Escape") hide();
    else if (event.key === "Enter") select(active);
    else { active = (active + (event.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length; highlight(); }
  }, true);
  return hide;
}
