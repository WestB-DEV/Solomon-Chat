import {
  Component, MarkdownRenderer, MarkdownView, Menu, Notice, Plugin, Platform, TFile, WorkspaceLeaf, normalizePath, setIcon,
} from "obsidian";
import { DEFAULT_SETTINGS, FM, PERSPECTIVE_PROMPTS, type Side, type SolomonSettings } from "./constants";
import { assessContinuationRollover, buildContinuationSegment, continuationFileName, planContinuationRepairs } from "./continuation";
import { draftKey, moveDraft, normalizeDraftEnvelope, upsertDraft, type DraftEnvelope, type DurableDraft } from "./drafts";
import { FormModal } from "./modals";
import { applySend, createStableId, currentTimestamp, ensureMessageIds, parseConversation, replaceMessageById, type Conversation } from "./model";
import { SolomonSettingsTab } from "./settings";
import { calculateViewportLayout } from "./viewport";

interface ViewState {
  leaf: WorkspaceLeaf;
  file: TFile;
  root: HTMLElement;
  header: HTMLElement;
  messages: HTMLElement;
  announcer: HTMLElement;
  composer: HTMLElement;
  attachmentTray: HTMLElement;
  textarea: HTMLTextAreaElement;
  sender: HTMLElement;
  attach: HTMLButtonElement;
  send: HTMLButtonElement;
  draft: string;
  draftAttachments: string[];
  conversationId: string;
  operationId?: string;
  operationSide?: Side;
  sourceContent: string;
  continuationSuggested: boolean;
  messageFiles: TFile[];
  conversation: Conversation;
  component: Component;
  focused: boolean;
  sending: boolean;
  blurTimer: number;
  lastMessageCount: number;
  visibleStart: number;
}

type Frontmatter = Record<string, unknown>;

export default class SolomonChatPlugin extends Plugin {
  settings: SolomonSettings = { ...DEFAULT_SETTINGS };
  private states = new Map<WorkspaceLeaf, ViewState>();
  private rawLeaves = new WeakMap<WorkspaceLeaf, string>();
  private fileQueues = new Map<string, Promise<unknown>>();
  private refreshTokens = new WeakMap<WorkspaceLeaf, number>();
  private viewportFrame = 0;
  private viewportTimer = 0;
  private draftTimer = 0;
  private drafts: DraftEnvelope = { version: 1, drafts: {} };

  async onload(): Promise<void> {
    const stored = await this.loadData() as { settings?: Partial<SolomonSettings>; drafts?: unknown } & Partial<SolomonSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(stored?.settings || stored || {}) };
    this.drafts = normalizeDraftEnvelope(stored?.drafts);
    this.addRibbonIcon("messages-square", "Create a conversation", () => this.openCreateModal());
    this.addCommand({ id: "create-conversation", name: "Create new conversation", callback: () => this.openCreateModal() });
    this.addCommand({ id: "edit-participants", name: "Edit conversation participants", checkCallback: (checking) => this.withActiveConversation(checking, (file) => this.openParticipantsModal(file)) });
    this.addCommand({ id: "switch-speaker", name: "Switch active speaker", checkCallback: (checking) => this.withActiveConversation(checking, (file) => void this.switchSpeaker(file)) });
    this.addCommand({ id: "toggle-raw-markdown", name: "Toggle chat and raw Markdown", checkCallback: (checking) => this.withActiveConversation(checking, () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view) this.toggleRaw(view.leaf);
    }) });
    this.addCommand({ id: "export-transcript", name: "Export readable transcript", checkCallback: (checking) => this.withActiveConversation(checking, (file) => void this.exportTranscript(file)) });
    this.addSettingTab(new SolomonSettingsTab(this.app, this));

    this.registerEvent(this.app.workspace.on("layout-change", () => this.scheduleAll()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.scheduleAll()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleAll()));
    this.registerEvent(this.app.vault.on("modify", (file) => file instanceof TFile && this.scheduleFile(file)));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => this.scheduleFile(file)));
    this.registerDomEvent(window, "resize", () => this.scheduleViewport());
    this.registerDomEvent(document, "visibilitychange", () => { if (document.visibilityState === "hidden") void this.flushDrafts(); });
    if (window.visualViewport) {
      const update = () => this.scheduleViewport();
      window.visualViewport.addEventListener("resize", update);
      window.visualViewport.addEventListener("scroll", update);
      this.register(() => { window.visualViewport?.removeEventListener("resize", update); window.visualViewport?.removeEventListener("scroll", update); });
    }
    this.app.workspace.onLayoutReady(() => this.scheduleAll());
  }

  onunload(): void {
    if (this.viewportFrame) window.cancelAnimationFrame(this.viewportFrame);
    if (this.viewportTimer) window.clearTimeout(this.viewportTimer);
    if (this.draftTimer) window.clearTimeout(this.draftTimer);
    void this.flushDrafts();
    for (const leaf of [...this.states.keys()]) this.teardown(leaf);
  }

  async saveSettings(): Promise<void> { await this.saveData({ settings: this.settings, drafts: this.drafts }); }

  refreshAllLeaves(): void {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) void this.refreshLeaf(leaf);
  }

  private scheduleAll(): void {
    this.refreshAllLeaves();
    window.setTimeout(() => this.refreshAllLeaves(), 100);
    this.scheduleViewport();
  }

  private scheduleFile(file: TFile): void {
    if (file.extension !== "md") return;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) void this.refreshLeaf(leaf);
    }
  }

  private async refreshLeaf(leaf: WorkspaceLeaf): Promise<void> {
    if (!(leaf.view instanceof MarkdownView)) return;
    const file = leaf.view.file;
    if (!(file instanceof TFile) || file.extension !== "md") return this.teardown(leaf);
    if (this.rawLeaves.get(leaf) === file.path) return this.teardown(leaf);
    const token = (this.refreshTokens.get(leaf) || 0) + 1;
    this.refreshTokens.set(leaf, token);
    let content = await this.app.vault.cachedRead(file);
    if (this.refreshTokens.get(leaf) !== token || leaf.view.file?.path !== file.path) return;
    let conversation = parseConversation(content, this.frontmatterFor(file), {
      leftName: this.settings.defaultLeftName,
      rightName: this.settings.defaultRightName,
      attachmentFolder: this.defaultAttachmentFolder(file),
    });
    if (!conversation.isConversation) return this.teardown(leaf);
    if (!conversation.conversationId) {
      const conversationId = createStableId("conversation");
      await this.app.fileManager.processFrontMatter(file, (fm: Frontmatter) => { fm[FM.conversationId] = conversationId; if (!fm[FM.segmentIndex]) fm[FM.segmentIndex] = 1; });
      content = await this.app.vault.read(file); conversation = parseConversation(content, this.frontmatterFor(file), { leftName: this.settings.defaultLeftName, rightName: this.settings.defaultRightName, attachmentFolder: this.defaultAttachmentFolder(file) });
    }
    const migratedContent = ensureMessageIds(content); if (migratedContent !== content) { await this.app.vault.modify(file, migratedContent); content = migratedContent; conversation = parseConversation(content, this.frontmatterFor(file), { leftName: this.settings.defaultLeftName, rightName: this.settings.defaultRightName, attachmentFolder: this.defaultAttachmentFolder(file) }); }
    let messageFiles = conversation.messages.map(() => file);
    const conversationId = conversation.conversationId;
    if (conversationId) {
      const folder = this.parentPath(file.path);
      const candidates = this.app.vault.getMarkdownFiles().filter((candidate) => this.parentPath(candidate.path) === folder && (this.frontmatterString(this.frontmatterFor(candidate), FM.conversationId) || this.frontmatterString(this.frontmatterFor(candidate), "conversation_id")) === conversationId);
      if (candidates.length > 1) {
        const loaded = await Promise.all(candidates.map(async (candidate) => { const original = await this.app.vault.cachedRead(candidate); const migrated = ensureMessageIds(original); if (migrated !== original) await this.app.vault.modify(candidate, migrated); return { file: candidate, content: migrated, index: Number(this.frontmatterFor(candidate)[FM.segmentIndex] || this.frontmatterFor(candidate).segment_index) || 1 }; }));
        loaded.sort((a, b) => a.index - b.index || a.file.path.localeCompare(b.file.path));
        const parsed = loaded.map((item) => ({ ...item, conversation: parseConversation(item.content, this.frontmatterFor(item.file), { leftName: this.settings.defaultLeftName, rightName: this.settings.defaultRightName, attachmentFolder: this.defaultAttachmentFolder(item.file) }) }));
        conversation = { ...conversation, messages: parsed.flatMap((item) => item.conversation.messages) };
        messageFiles = parsed.flatMap((item) => item.conversation.messages.map(() => item.file));
        const repairPlan = planContinuationRepairs(loaded.map((item) => ({ fileName: item.file.name, content: item.content })));
        for (const repair of repairPlan.repairs) { const target = loaded.find((item) => item.file.name === repair.fileName); if (target && target.content !== repair.content) await this.app.vault.modify(target.file, repair.content); }
      }
    }
    this.render(leaf, file, conversation, content, messageFiles);
  }

  private createState(leaf: WorkspaceLeaf, file: TFile, conversation: Conversation): ViewState {
    if (!(leaf.view instanceof MarkdownView)) throw new Error("Solomon Chat requires a Markdown view");
    const host = leaf.view.containerEl.querySelector<HTMLElement>(".view-content") || leaf.view.contentEl;
    const root = host.createDiv({ cls: "solomon-chat-root" });
    const header = root.createDiv({ cls: "solomon-chat-header" });
    const messages = root.createDiv({ cls: "solomon-chat-messages", attr: { role: "log", "aria-label": "Conversation messages" } });
    const announcer = root.createDiv({ cls: "solomon-chat-announcer", attr: { "aria-live": "polite", "aria-atomic": "true" } });
    const composer = root.createDiv({ cls: "solomon-chat-composer" });
    const sender = composer.createDiv({ cls: "solomon-chat-sender", attr: { role: "radiogroup", "aria-label": "Send message as" } });
    for (const side of ["left", "right"] as Side[]) { const option = sender.createEl("button", { attr: { role: "radio", "data-side": side } }); option.type = "button"; option.addEventListener("click", () => void this.selectSpeaker(file, side)); }
    const attachmentTray = composer.createDiv({ cls: "solomon-chat-attachment-tray", attr: { "aria-label": "Draft attachments" } });
    const textarea = composer.createEl("textarea", { attr: { rows: "1", enterkeyhint: "send", autocapitalize: "sentences", placeholder: "Write a message…" } });
    const attach = composer.createEl("button", { cls: "solomon-chat-icon", attr: { "aria-label": "Attach files" } }); attach.type = "button"; setIcon(attach, "paperclip");
    const send = composer.createEl("button", { cls: "solomon-chat-send", attr: { "aria-label": "Send message" } }); send.type = "button"; setIcon(send, "arrow-up");
    const component = new Component(); component.load();
    const conversationId = conversation.conversationId;
    const restored = this.drafts.drafts[draftKey(conversationId, file.path)] || this.drafts.drafts[draftKey("", file.path)];
    if (restored && !this.drafts.drafts[draftKey(conversationId, file.path)]) this.drafts = moveDraft(this.drafts, "", file.path, conversationId, file.path);
    const state: ViewState = { leaf, file, root, header, messages, announcer, composer, attachmentTray, textarea, sender, attach, send, draft: restored?.text || "", draftAttachments: restored?.attachmentPaths || [], conversationId, operationId: restored?.operationId, operationSide: restored?.operationSide, sourceContent: "", continuationSuggested: false, messageFiles: [], conversation, component, focused: false, sending: false, blurTimer: 0, lastMessageCount: 0, visibleStart: 0 };

    textarea.addEventListener("input", () => { state.draft = textarea.value; state.operationId = undefined; state.operationSide = undefined; this.persistDraft(state); this.resizeTextarea(textarea); send.disabled = state.sending || !textarea.value.trim(); });
    textarea.addEventListener("focus", () => { state.focused = true; this.applyViewport(state); });
    textarea.addEventListener("blur", () => {
      window.clearTimeout(state.blurTimer);
      state.blurTimer = window.setTimeout(() => { state.focused = state.textarea === document.activeElement; this.applyViewport(state); }, 140);
    });
    textarea.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); void this.submit(state); }
    });
    send.addEventListener("pointerdown", (event: PointerEvent) => event.preventDefault());
    send.addEventListener("click", () => void this.submit(state));
    sender.addEventListener("pointerdown", (event: PointerEvent) => event.preventDefault());
    attach.addEventListener("pointerdown", (event: PointerEvent) => event.preventDefault());
    attach.addEventListener("click", () => void this.attachFiles(state));
    return state;
  }

  private render(leaf: WorkspaceLeaf, file: TFile, conversation: Conversation, sourceContent: string, messageFiles: TFile[]): void {
    let state = this.states.get(leaf);
    const firstRender = !state;
    const oldPath = state?.file.path;
    const preserveFocus = state?.textarea === document.activeElement;
    const oldCount = state?.lastMessageCount || 0;
    if (!state) { state = this.createState(leaf, file, conversation); this.states.set(leaf, state); }
    if (oldPath && oldPath !== file.path) {
      const conversationId = this.frontmatterString(this.frontmatterFor(file), FM.conversationId);
      const restored = this.drafts.drafts[draftKey(conversationId, file.path)];
      state.draft = restored?.text || ""; state.draftAttachments = restored?.attachmentPaths || []; state.conversationId = conversationId; state.operationId = restored?.operationId; state.operationSide = restored?.operationSide;
    }
    state.file = file; state.conversation = conversation; state.sourceContent = sourceContent; state.messageFiles = messageFiles;
    state.continuationSuggested = assessContinuationRollover(sourceContent, conversation.messages.length).shouldOfferContinuation;
    state.component.unload(); state.component = new Component(); state.component.load();
    leaf.view.containerEl.addClass("solomon-chat-active");
    this.applyColors(state.root);
    this.renderHeader(state);
    state.messages.empty();
    if (conversation.preamble) {
      const preamble = state.messages.createDiv({ cls: "solomon-chat-preamble" });
      void MarkdownRenderer.render(this.app, conversation.preamble, preamble, file.path, state.component);
    }
    if (!conversation.messages.length) this.renderEmptyState(state);
    if (firstRender || oldPath !== file.path) state.visibleStart = Math.max(0, conversation.messages.length - 400);
    else state.visibleStart = Math.min(state.visibleStart, Math.max(0, conversation.messages.length - 1));
    if (state.visibleStart > 0) {
      const older = state.messages.createEl("button", { cls: "solomon-chat-load-older", text: `Load ${Math.min(400, state.visibleStart)} older messages` });
      older.addEventListener("click", () => { state.visibleStart = Math.max(0, state.visibleStart - 400); this.render(state.leaf, state.file, state.conversation, state.sourceContent, state.messageFiles); });
    }
    for (let index = state.visibleStart; index < conversation.messages.length; index++) {
      const animate = !firstRender && conversation.messages.length > oldCount && index >= oldCount;
      this.renderMessage(state, index, animate);
    }
    state.lastMessageCount = conversation.messages.length;
    state.textarea.value = state.draft;
    this.renderAttachmentTray(state);
    state.send.disabled = state.sending || !state.draft.trim();
    this.resizeTextarea(state.textarea);
    this.applyViewport(state);
    const renderedState = state;
    window.setTimeout(() => {
      if (firstRender || conversation.messages.length > oldCount) renderedState.messages.scrollTop = renderedState.messages.scrollHeight;
      if (this.settings.autoFocusComposer && (firstRender && !Platform.isMobile || preserveFocus)) this.focusTextarea(renderedState.textarea);
    }, 0);
  }

  private renderHeader(state: ViewState): void {
    state.header.empty();
    state.header.createSpan({ cls: "solomon-chat-title", text: state.file.basename });
    const actions = state.header.createDiv({ cls: "solomon-chat-actions" });
    this.iconButton(actions, "ellipsis", "Conversation actions", () => this.openConversationMenu(state));
    const activeName = state.conversation.nextSide === "left" ? state.conversation.leftName : state.conversation.rightName;
    for (const option of Array.from(state.sender.querySelectorAll<HTMLButtonElement>("button[data-side]"))) { const side = option.dataset.side as Side; option.textContent = side === "left" ? state.conversation.leftName : state.conversation.rightName; option.setAttribute("aria-checked", String(side === state.conversation.nextSide)); option.toggleClass("is-active", side === state.conversation.nextSide); }
    state.textarea.placeholder = `Message as ${activeName}`;
  }

  private openConversationMenu(state: ViewState): void {
    const menu = new Menu();
    if (this.settings.showPerspectivePrompts) menu.addItem((item) => item.setTitle("Perspective prompts").setIcon("sparkles").onClick(() => this.openPromptMenu(state)));
    menu.addItem((item) => item.setTitle("Edit participants").setIcon("users").onClick(() => this.openParticipantsModal(state.file)));
    menu.addItem((item) => item.setTitle("Edit raw Markdown").setIcon("file-pen-line").onClick(() => this.toggleRaw(state.leaf)));
    menu.addItem((item) => item.setTitle("Export transcript").setIcon("download").onClick(() => void this.exportTranscript(state.file)));
    if (state.continuationSuggested) menu.addItem((item) => item.setTitle("Continue on a new page").setIcon("files").onClick(() => void this.continueConversation(state)));
    const rect = state.header.getBoundingClientRect(); menu.showAtPosition({ x: rect.right - 8, y: rect.bottom });
  }

  private renderPerson(parent: HTMLElement, state: ViewState, side: Side): void {
    const name = side === "left" ? state.conversation.leftName : state.conversation.rightName;
    const bio = side === "left" ? state.conversation.leftBio : state.conversation.rightBio;
    const avatar = side === "left" ? state.conversation.leftAvatar : state.conversation.rightAvatar;
    const button = parent.createEl("button", { cls: `solomon-chat-person is-${side}`, attr: { "aria-label": bio ? `${name}: ${bio}` : name } });
    const avatarFile = avatar ? this.app.vault.getAbstractFileByPath(avatar) : null;
    if (avatarFile instanceof TFile) {
      const resource = this.app.vault.getResourcePath(avatarFile);
      button.createEl("img", { attr: { src: resource, alt: "" } });
    } else button.createSpan({ cls: "solomon-chat-initial", text: name.slice(0, 1).toUpperCase() });
    button.createSpan({ text: name });
    button.addEventListener("click", () => this.openParticipantsModal(state.file));
  }

  private renderEmptyState(state: ViewState): void {
    const empty = state.messages.createDiv({ cls: "solomon-chat-empty" });
    empty.createEl("h3", { text: "Start with what’s on your mind" });
    empty.createEl("p", { text: "Then switch sides and answer as if you were advising someone you care about." });
    const prompt = empty.createEl("button", { text: "Use a perspective prompt" });
    prompt.addEventListener("click", () => this.openPromptMenu(state));
  }

  private renderMessage(state: ViewState, index: number, animate = false): void {
    const message = state.conversation.messages[index];
    const messageFile = state.messageFiles[index] || state.file;
    const wrapper = state.messages.createDiv({ cls: `solomon-chat-message is-${message.side}${animate ? " is-entering" : ""}` });
    const name = message.side === "left" ? state.conversation.leftName : state.conversation.rightName;
    if (this.settings.showTimestamps) wrapper.createDiv({ cls: "solomon-chat-meta", text: message.timestamp ? `${name} · ${this.formatTimestamp(message.timestamp)}` : name });
    const bubble = wrapper.createDiv({ cls: "solomon-chat-bubble" });
    const action = wrapper.createEl("button", { cls: "solomon-chat-message-action solomon-chat-icon", attr: { "aria-label": `Actions for message from ${name}` } }); setIcon(action, "ellipsis");
    void MarkdownRenderer.render(this.app, message.content || " ", bubble, messageFile.path, state.component).then(() => this.wireLinks(bubble, messageFile.path));
    const showMenu = (event: MouseEvent) => { event.preventDefault(); const menu = new Menu();
      menu.addItem((item) => item.setTitle("Edit message").setIcon("pencil").onClick(() => this.openEditModal(messageFile, message.id, message.content)));
      menu.addItem((item) => item.setTitle("Delete message").setIcon("trash-2").onClick(() => void this.deleteMessage(messageFile, message.id, message.content)));
      menu.showAtMouseEvent(event);
    };
    bubble.addEventListener("contextmenu", showMenu);
    action.addEventListener("click", (event) => showMenu(new MouseEvent("contextmenu", { clientX: event.clientX, clientY: event.clientY })));
    let timer = 0; let startX = 0; let startY = 0;
    bubble.addEventListener("touchstart", (event) => { const touch = event.touches[0]; startX = touch.clientX; startY = touch.clientY; timer = window.setTimeout(() => showMenu(new MouseEvent("contextmenu", { clientX: startX, clientY: startY })), 550); }, { passive: true });
    const cancel = () => { if (timer) window.clearTimeout(timer); timer = 0; };
    bubble.addEventListener("touchend", cancel); bubble.addEventListener("touchcancel", cancel);
    bubble.addEventListener("touchmove", (event) => { const touch = event.touches[0]; if (Math.abs(touch.clientX - startX) > 8 || Math.abs(touch.clientY - startY) > 8) cancel(); }, { passive: true });
  }

  private async submit(state: ViewState): Promise<void> {
    const draft = state.textarea.value;
    if (!draft.trim() || state.sending) return;
    const side = state.operationSide || state.conversation.nextSide;
    const operationId = state.operationId || createStableId();
    state.operationId = operationId; state.operationSide = side; this.persistDraft(state); await this.flushDrafts();
    state.sending = true; state.send.disabled = true; state.attach.disabled = true;
    try {
      await this.queue(state.file.path, async () => this.app.vault.process(state.file, (content) => applySend(content, { id: operationId, side, timestamp: currentTimestamp(), message: draft })));
      state.draft = ""; state.textarea.value = ""; state.operationId = undefined; state.operationSide = undefined; state.draftAttachments = []; this.persistDraft(state); await this.flushDrafts();
      state.conversation.nextSide = side === "left" ? "right" : "left";
      state.announcer.textContent = `Message sent as ${side === "left" ? state.conversation.leftName : state.conversation.rightName}`;
      this.renderHeader(state); this.resizeTextarea(state.textarea); this.focusTextarea(state.textarea);
    } catch (error) {
      console.error("Solomon Chat: send failed", error);
      let persisted = false;
      try { persisted = parseConversation(await this.app.vault.read(state.file), this.frontmatterFor(state.file), { leftName: this.settings.defaultLeftName, rightName: this.settings.defaultRightName, attachmentFolder: this.defaultAttachmentFolder(state.file) }).messages.some((message) => message.id === operationId); } catch (readError) { console.error("Solomon Chat: send reconciliation failed", readError); }
      if (persisted) { state.draft = ""; state.textarea.value = ""; state.operationId = undefined; state.operationSide = undefined; state.draftAttachments = []; this.persistDraft(state); await this.flushDrafts(); state.conversation.nextSide = side === "left" ? "right" : "left"; this.renderHeader(state); new Notice("Message sent."); }
      else new Notice("Could not send that message. Your draft is still here.");
    }
    finally { state.sending = false; state.attach.disabled = false; state.send.disabled = !state.textarea.value.trim(); }
  }

  private async switchSpeaker(file: TFile): Promise<void> {
    const visibleStates = [...this.states.values()].filter((state) => state.file.path === file.path);
    const visibleSide = visibleStates[0]?.conversation.nextSide;
    const cachedSide = this.frontmatterFor(file)[FM.nextSide];
    const target: Side = (visibleSide || cachedSide) === "left" ? "right" : "left";
    await this.selectSpeaker(file, target);
  }

  private async selectSpeaker(file: TFile, target: Side): Promise<void> {
    const visibleStates = [...this.states.values()].filter((state) => state.file.path === file.path);
    for (const state of visibleStates) {
      if (state.operationSide && state.operationSide !== target) { state.operationId = undefined; state.operationSide = undefined; this.persistDraft(state); }
      state.conversation.nextSide = target;
      this.renderHeader(state);
    }
    await this.queue(file.path, async () => this.app.fileManager.processFrontMatter(file, (fm: Frontmatter) => {
      this.ensureFrontmatter(fm, file, target);
    }));
    this.scheduleFile(file);
    window.setTimeout(() => { const state = [...this.states.values()].find((item) => item.file.path === file.path); if (state) this.focusTextarea(state.textarea); }, 0);
  }

  private openPromptMenu(state: ViewState): void {
    const menu = new Menu();
    for (const prompt of PERSPECTIVE_PROMPTS) menu.addItem((item) => item.setTitle(prompt).onClick(() => {
      state.textarea.value = state.textarea.value.trim() ? `${state.textarea.value.trimEnd()}\n\n${prompt}` : prompt;
      state.draft = state.textarea.value; state.send.disabled = false; this.resizeTextarea(state.textarea); this.focusTextarea(state.textarea);
    }));
    const rect = state.header.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left + Math.min(rect.width / 2, 220), y: rect.bottom });
  }

  private openCreateModal(): void {
    new FormModal(this.app, { title: "New Solomon conversation", submitLabel: "Create", initial: { title: "", left: this.settings.defaultLeftName, right: this.settings.defaultRightName }, fields: [
      { key: "title", name: "Conversation name", placeholder: "What I need perspective on" },
      { key: "left", name: "Wise side", description: "The character or perspective giving advice." },
      { key: "right", name: "Self side", description: "Usually you." },
    ], onSubmit: async (values) => { await this.createConversation(values.title, values.left, values.right); } }).open();
  }

  private openParticipantsModal(file: TFile): void {
    const fm = this.frontmatterFor(file);
    new FormModal(this.app, { title: "Conversation participants", initial: {
      left: this.frontmatterString(fm, FM.leftName) || this.settings.defaultLeftName, right: this.frontmatterString(fm, FM.rightName) || this.settings.defaultRightName,
      leftBio: this.frontmatterString(fm, FM.leftBio), rightBio: this.frontmatterString(fm, FM.rightBio), leftAvatar: this.frontmatterString(fm, FM.leftAvatar), rightAvatar: this.frontmatterString(fm, FM.rightAvatar),
    }, fields: [
      { key: "left", name: "Left-side name" }, { key: "leftBio", name: "Left-side bio", type: "textarea", description: "Who are they, and what perspective should they represent?" }, { key: "leftAvatar", name: "Left avatar path", description: "Optional vault-relative image path." },
      { key: "right", name: "Right-side name" }, { key: "rightBio", name: "Right-side bio", type: "textarea" }, { key: "rightAvatar", name: "Right avatar path", description: "Optional vault-relative image path." },
    ], onSubmit: async (values) => {
      await this.queue(file.path, async () => this.app.fileManager.processFrontMatter(file, (edit: Frontmatter) => {
        this.ensureFrontmatter(edit, file, edit[FM.nextSide] === "left" ? "left" : "right");
        edit[FM.leftName] = values.left.trim() || this.settings.defaultLeftName; edit[FM.rightName] = values.right.trim() || this.settings.defaultRightName;
        this.setOrDelete(edit, FM.leftBio, values.leftBio); this.setOrDelete(edit, FM.rightBio, values.rightBio); this.setOrDelete(edit, FM.leftAvatar, values.leftAvatar); this.setOrDelete(edit, FM.rightAvatar, values.rightAvatar);
      }));
    } }).open();
  }

  private openEditModal(file: TFile, messageId: string, content: string): void {
    new FormModal(this.app, { title: "Edit message", initial: { content }, fields: [{ key: "content", name: "Message", type: "textarea" }], onSubmit: async (values) => {
      if (!values.content.trim()) { new Notice("A message cannot be empty. Delete it instead."); return false; }
      await this.queue(file.path, async () => this.app.vault.process(file, (existing) => replaceMessageById(existing, messageId, values.content)));
    } }).open();
  }

  private async deleteMessage(file: TFile, messageId: string, _original: string): Promise<void> {
    let before = ""; let after = "";
    await this.queue(file.path, async () => this.app.vault.process(file, (existing) => { before = existing; after = replaceMessageById(existing, messageId, null); return after; }));
    const content = createFragment(); content.appendText("Message deleted "); const undo = content.createEl("button", { text: "Undo" });
    const notice = new Notice(content, 7000); undo.addEventListener("click", () => { void this.queue(file.path, async () => this.app.vault.process(file, (existing) => existing === after ? before : existing)); notice.hide(); });
  }

  private async createConversation(title: string, left: string, right: string): Promise<void> {
    const folder = normalizePath(this.settings.conversationFolder || "");
    await this.ensureFolder(folder);
    const base = this.safeName(title || "New Conversation");
    const path = await this.availablePath(folder, base, ".md");
    const attachmentFolder = normalizePath(`${this.parentPath(path) ? `${this.parentPath(path)}/` : ""}${this.basename(path)}.attachments`);
    const yaml = ["---", `${FM.flag}: true`, `${FM.conversationId}: ${createStableId("conversation")}`, `${FM.segmentIndex}: 1`, `${FM.leftName}: ${this.yaml(left.trim() || this.settings.defaultLeftName)}`, `${FM.rightName}: ${this.yaml(right.trim() || this.settings.defaultRightName)}`, `${FM.nextSide}: right`, `${FM.attachmentFolder}: ${this.yaml(attachmentFolder)}`, "---", ""].join("\n");
    const file = await this.app.vault.create(path, yaml);
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  private async attachFiles(state: ViewState): Promise<void> {
    const input = document.body.createEl("input", { attr: { type: "file", multiple: "", hidden: "" } });
    const selected = await new Promise<File[]>((resolve) => {
      let settled = false;
      const finish = (files: File[]) => { if (settled) return; settled = true; window.removeEventListener("focus", focusFallback); resolve(files); };
      const focusFallback = () => window.setTimeout(() => finish(Array.from(input.files || [])), 400);
      input.addEventListener("change", () => finish(Array.from(input.files || [])), { once: true });
      input.addEventListener("cancel", () => finish([]), { once: true });
      window.addEventListener("focus", focusFallback, { once: true }); input.click();
    });
    input.remove(); if (!selected.length) return;
    const tooLarge = selected.find((file) => file.size > 100 * 1024 * 1024);
    if (tooLarge) { new Notice(`${tooLarge.name} exceeds Solomon's 100 MiB per-file mobile safety limit.`); return; }
    state.attach.disabled = true;
    try {
      const folder = await this.ensureAttachmentFolder(state.file);
      const links: string[] = []; const importedPaths: string[] = [];
      for (const file of selected) {
        const target = await this.availablePath(folder, this.safeName(file.name, true), "");
        await this.app.vault.createBinary(target, await file.arrayBuffer());
        importedPaths.push(target);
        const relative = this.relativePath(this.parentPath(state.file.path), target);
        const escaped = encodeURI(relative).replace(/#/g, "%23");
        links.push(file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|heic)$/i.test(file.name) ? `![${file.name}](${escaped})` : `[${file.name}](${escaped})`);
      }
      const insertion = links.join("\n");
      state.textarea.value = state.textarea.value.trim() ? `${state.textarea.value.trimEnd()}\n\n${insertion}` : insertion;
      state.draft = state.textarea.value; state.draftAttachments.push(...importedPaths); this.persistDraft(state); this.renderAttachmentTray(state); state.send.disabled = false; this.resizeTextarea(state.textarea); this.focusTextarea(state.textarea);
    } catch (error) { console.error("Solomon Chat: attachment failed", error); new Notice("Could not import attachment."); }
    finally { state.attach.disabled = false; }
  }

  private async ensureAttachmentFolder(file: TFile): Promise<string> {
    let folder = this.defaultAttachmentFolder(file);
    await this.queue(file.path, async () => this.app.fileManager.processFrontMatter(file, (fm: Frontmatter) => {
      folder = this.frontmatterString(fm, FM.attachmentFolder) || folder;
      this.ensureFrontmatter(fm, file, fm[FM.nextSide] === "left" ? "left" : "right"); fm[FM.attachmentFolder] = folder;
    }));
    await this.ensureFolder(folder); return folder;
  }

  private toggleRaw(leaf: WorkspaceLeaf): void {
    const file = leaf.view instanceof MarkdownView ? leaf.view.file : null;
    if (!(file instanceof TFile)) return;
    if (this.rawLeaves.get(leaf) === file.path) this.rawLeaves.delete(leaf); else this.rawLeaves.set(leaf, file.path);
    void this.refreshLeaf(leaf);
  }

  private async exportTranscript(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    const conversation = parseConversation(content, this.frontmatterFor(file), { leftName: this.settings.defaultLeftName, rightName: this.settings.defaultRightName, attachmentFolder: this.defaultAttachmentFolder(file) });
    const text = conversation.messages.map((message) => `${message.side === "left" ? conversation.leftName : conversation.rightName}${message.timestamp ? ` - ${message.timestamp}` : ""}\n${message.content}`).join("\n\n");
    const path = await this.availablePath(this.parentPath(file.path), `${file.basename} - Transcript`, ".txt");
    await this.app.vault.create(path, `${text}\n`); new Notice(`Transcript saved to ${path}`);
  }

  private teardown(leaf: WorkspaceLeaf): void {
    const state = this.states.get(leaf); if (!state) return;
    window.clearTimeout(state.blurTimer); state.component.unload(); state.root.remove(); leaf.view.containerEl.removeClass("solomon-chat-active"); this.states.delete(leaf);
  }

  private scheduleViewport(): void {
    if (!this.viewportFrame) this.viewportFrame = window.requestAnimationFrame(() => { this.viewportFrame = 0; for (const state of this.states.values()) this.applyViewport(state); });
    window.clearTimeout(this.viewportTimer); this.viewportTimer = window.setTimeout(() => { this.viewportTimer = 0; for (const state of this.states.values()) this.applyViewport(state); }, 160);
  }

  private applyViewport(state: ViewState): void {
    if (!state.root.isConnected) return;
    const vv = window.visualViewport; const rect = state.root.getBoundingClientRect();
    const focused = state.focused || state.composer.contains(document.activeElement);
    const closedToolbarClearance = Platform.isMobile ? this.measureBottomToolbar(state.root) : 0;
    const layout = calculateViewportLayout({ mobile: Platform.isMobile, focused, layoutHeight: window.innerHeight, visualHeight: vv?.height || window.innerHeight, visualOffsetTop: vv?.offsetTop || 0, containerBottom: rect.bottom, closedToolbarClearance });
    state.root.classList.toggle("is-compose-mode", layout.composeMode); state.root.classList.toggle("is-keyboard-open", layout.keyboardOpen);
    state.root.style.setProperty("--solomon-bottom-clearance", `${layout.bottomClearance}px`);
  }

  private measureBottomToolbar(root: HTMLElement): number {
    const rect = root.getBoundingClientRect(); let top = rect.bottom;
    for (const element of document.elementsFromPoint(Math.max(8, rect.left + rect.width / 2), Math.max(8, window.innerHeight - 12))) {
      if (!element.instanceOf(HTMLElement) || root.contains(element) || element.contains(root)) continue;
      const style = getComputedStyle(element); if (style.position !== "fixed" && style.position !== "sticky") continue;
      const candidate = element.getBoundingClientRect(); if (candidate.bottom >= window.innerHeight - 4) top = Math.min(top, candidate.top);
    }
    return Math.max(0, Math.round(rect.bottom - top + (top < rect.bottom ? 6 : 0)));
  }

  private applyColors(root: HTMLElement): void {
    const keys = ["--solomon-left-bubble", "--solomon-right-bubble", "--solomon-left-text", "--solomon-right-text"];
    if (this.settings.useThemeColors) keys.forEach((key) => root.style.removeProperty(key));
    else { root.style.setProperty(keys[0], this.settings.leftBubbleColor); root.style.setProperty(keys[1], this.settings.rightBubbleColor); root.style.setProperty(keys[2], this.settings.leftTextColor); root.style.setProperty(keys[3], this.settings.rightTextColor); }
  }

  private wireLinks(container: HTMLElement, source: string): void {
    container.querySelectorAll<HTMLAnchorElement>("a.internal-link").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); void this.app.workspace.openLinkText(link.dataset.href || link.getAttribute("href") || "", source, event.ctrlKey || event.metaKey); }));
  }

  private iconButton(parent: HTMLElement, icon: string, label: string, action: () => void): void {
    const button = parent.createEl("button", { cls: "solomon-chat-icon", attr: { "aria-label": label, "data-tooltip-position": "bottom" } }); setIcon(button, icon); button.addEventListener("click", action);
  }

  private withActiveConversation(checking: boolean, action: (file: TFile) => void): boolean {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView); const file = view?.file;
    if (!(file instanceof TFile)) return false;
    const fm = this.frontmatterFor(file);
    if (!fm[FM.flag]) return false; if (!checking) action(file); return true;
  }

  private ensureFrontmatter(fm: Frontmatter, file: TFile, side: Side): void {
    fm[FM.flag] = true;
    if (!this.frontmatterString(fm, FM.leftName)) fm[FM.leftName] = this.settings.defaultLeftName;
    if (!this.frontmatterString(fm, FM.rightName)) fm[FM.rightName] = this.settings.defaultRightName;
    fm[FM.nextSide] = side;
    if (!this.frontmatterString(fm, FM.conversationId)) fm[FM.conversationId] = createStableId("conversation");
    if (!fm[FM.segmentIndex]) fm[FM.segmentIndex] = 1;
    if (!this.frontmatterString(fm, FM.attachmentFolder)) fm[FM.attachmentFolder] = this.defaultAttachmentFolder(file);
  }

  private renderAttachmentTray(state: ViewState): void {
    state.attachmentTray.empty(); state.attachmentTray.toggleClass("is-empty", state.draftAttachments.length === 0);
    for (const path of state.draftAttachments) {
      const chip = state.attachmentTray.createDiv({ cls: "solomon-chat-attachment-chip" }); chip.createSpan({ text: path.slice(path.lastIndexOf("/") + 1) });
      const remove = chip.createEl("button", { attr: { "aria-label": `Remove ${path.slice(path.lastIndexOf("/") + 1)} from draft` } }); setIcon(remove, "x");
      remove.addEventListener("click", () => void this.removeDraftAttachment(state, path));
    }
  }

  private async removeDraftAttachment(state: ViewState, path: string): Promise<void> {
    const relative = encodeURI(this.relativePath(this.parentPath(state.file.path), path)).replace(/#/g, "%23");
    state.draft = state.textarea.value.split("\n").filter((line) => !line.includes(`](${relative})`)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    state.textarea.value = state.draft; state.draftAttachments = state.draftAttachments.filter((item) => item !== path);
    const ownedFolder = normalizePath(state.conversation.attachmentFolder); const normalizedPath = normalizePath(path);
    const target = this.app.vault.getAbstractFileByPath(normalizedPath); if (normalizedPath.startsWith(`${ownedFolder}/`) && target instanceof TFile) await this.app.fileManager.trashFile(target);
    this.persistDraft(state, true); this.renderAttachmentTray(state); this.resizeTextarea(state.textarea); state.send.disabled = !state.draft.trim();
  }

  private async continueConversation(state: ViewState): Promise<void> {
    if (state.sending || state.textarea.value.trim()) { new Notice("Send or clear the current draft before continuing on a new page."); return; }
    const currentFm = this.frontmatterFor(state.file);
    const conversationId = this.frontmatterString(currentFm, FM.conversationId) || createStableId("conversation");
    const currentIndex = Number(currentFm[FM.segmentIndex]) || 1;
    const baseName = state.file.basename.replace(/ \u2014 Part \d{3}$/u, "");
    const nextName = continuationFileName(baseName, currentIndex + 1);
    const folder = this.parentPath(state.file.path); const nextPath = normalizePath(`${folder ? `${folder}/` : ""}${nextName}`);
    if (this.app.vault.getAbstractFileByPath(nextPath)) { new Notice("That continuation page already exists. Solomon will repair its links when opened."); return; }
    const built = buildContinuationSegment({ baseName, conversationId, segmentIndex: currentIndex + 1, messageMarkdown: "" });
    const nextFile = await this.app.vault.create(nextPath, built.content);
    try {
      await this.app.fileManager.processFrontMatter(nextFile, (fm: Frontmatter) => {
        fm[FM.flag] = true; fm[FM.conversationId] = conversationId; fm[FM.segmentIndex] = currentIndex + 1; fm[FM.previousSegment] = `[[${state.file.basename}]]`;
        for (const key of [FM.leftName, FM.rightName, FM.nextSide, FM.attachmentFolder, FM.leftBio, FM.rightBio, FM.leftAvatar, FM.rightAvatar]) if (currentFm[key] != null) fm[key] = currentFm[key];
      });
      const nextContent = await this.app.vault.read(nextFile);
      const plan = planContinuationRepairs([{ fileName: state.file.name, content: state.sourceContent }, { fileName: nextFile.name, content: nextContent }]);
      const currentRepair = plan.repairs.find((repair) => repair.fileName === state.file.name);
      if (currentRepair) await this.app.vault.modify(state.file, currentRepair.content);
      await this.app.workspace.getLeaf(false).openFile(nextFile);
    } catch (error) { console.error("Solomon Chat: continuation failed", error); new Notice("The new page was created with its back-link. Reopen either page to repair the forward link."); }
  }
  private persistDraft(state: ViewState, immediate = false): void {
    const draft: DurableDraft = { conversationId: state.conversationId, filePath: state.file.path, text: state.draft, attachmentPaths: state.draftAttachments, updatedAt: Date.now(), operationId: state.operationId, operationSide: state.operationSide };
    this.drafts = upsertDraft(this.drafts, draft);
    window.clearTimeout(this.draftTimer);
    if (immediate) void this.flushDrafts(); else this.draftTimer = window.setTimeout(() => void this.flushDrafts(), 350);
  }
  private async flushDrafts(): Promise<void> { window.clearTimeout(this.draftTimer); this.draftTimer = 0; await this.saveData({ settings: this.settings, drafts: this.drafts }); }
  private setOrDelete(fm: Frontmatter, key: string, value: string): void { if (value.trim()) fm[key] = value.trim(); else delete fm[key]; }
  private resizeTextarea(textarea: HTMLTextAreaElement): void { textarea.setCssProps({ height: "auto" }); textarea.setCssProps({ height: `${Math.min(textarea.scrollHeight, 144)}px` }); }
  private focusTextarea(textarea: HTMLTextAreaElement): void { textarea.focus({ preventScroll: true }); const end = textarea.value.length; textarea.setSelectionRange(end, end); }
  private formatTimestamp(value: string): string { const date = new Date(value.replace(" ", "T")); return Number.isNaN(date.valueOf()) ? value : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  private queue<T>(key: string, task: () => Promise<T>): Promise<T> { const previous = this.fileQueues.get(key) || Promise.resolve(); const next = previous.catch(() => undefined).then(task); this.fileQueues.set(key, next); const cleanup = () => { if (this.fileQueues.get(key) === next) this.fileQueues.delete(key); }; void next.then(cleanup, cleanup); return next; }
  private defaultAttachmentFolder(file: TFile): string { const parent = this.parentPath(file.path); return normalizePath(`${parent ? `${parent}/` : ""}${file.basename}.attachments`); }
  private parentPath(path: string): string { const normalized = normalizePath(path); const index = normalized.lastIndexOf("/"); return index < 0 ? "" : normalized.slice(0, index); }
  private basename(path: string): string { const name = path.slice(path.lastIndexOf("/") + 1); return name.replace(/\.md$/i, ""); }
  private safeName(value: string, keepExtension = false): string { const cleaned = value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() || "Untitled"; return keepExtension ? cleaned : cleaned.replace(/\.[^.]+$/, ""); }
  private yaml(value: string): string { return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; }
  private async ensureFolder(folder: string): Promise<void> { let path = ""; for (const part of normalizePath(folder).split("/").filter(Boolean)) { path = path ? `${path}/${part}` : part; if (!this.app.vault.getAbstractFileByPath(path)) await this.app.vault.createFolder(path); } }
  private async availablePath(folder: string, name: string, extension: string): Promise<string> { let index = 1; let candidate = ""; do { const suffix = index === 1 ? "" : ` ${index}`; candidate = normalizePath(`${folder ? `${folder}/` : ""}${extension ? name : name.replace(/\.[^.]+$/, "")}${suffix}${extension || (name.match(/\.[^.]+$/)?.[0] || "")}`); index++; } while (this.app.vault.getAbstractFileByPath(candidate)); return candidate; }
  private relativePath(fromFolder: string, target: string): string { const from = normalizePath(fromFolder).split("/").filter(Boolean); const to = normalizePath(target).split("/").filter(Boolean); let shared = 0; while (from[shared] === to[shared] && shared < from.length && shared < to.length) shared++; return [...from.slice(shared).map(() => ".."), ...to.slice(shared)].join("/"); }
  private frontmatterFor(file: TFile): Frontmatter { return Object.assign({}, this.app.metadataCache.getFileCache(file)?.frontmatter); }
  private frontmatterString(fm: Frontmatter, key: string): string { const value = fm[key]; return typeof value === "string" ? value.trim() : ""; }
}
