import {
  Component, MarkdownRenderer, MarkdownView, Menu, Notice, Plugin, Platform, TFile, TFolder, TextFileView, WorkspaceLeaf, normalizePath, setIcon,
} from "obsidian";
import { attachmentMarkdown, attachmentValidationError, formatAttachmentSize, isImageAttachment } from "./attachments";
import { DEFAULT_SETTINGS, FM, PERSPECTIVE_PROMPTS, type Side, type SolomonSettings } from "./constants";
import { draftKey, movePathDraft, movePathPendingCleanups, parseDraftMap, parsePendingCleanupMap, type DraftMap, type PendingCleanupMap } from "./drafts";
import { earlierMessageCount, initialVisibleStart, previousVisibleStart } from "./history";
import { ConfirmModal, FormModal } from "./modals";
import { appendMessageTransaction, currentTimestamp, hasMessageId, parseConversation, replaceTargetMessage, type ChatMessage, type Conversation } from "./model";
import { SolomonSettingsTab } from "./settings";
import { shouldRouteToChat, shouldSubmitComposerKey } from "./ui-behavior";
import { calculateViewportLayout } from "./viewport";

interface ViewState {
  leaf: WorkspaceLeaf;
  file: TFile;
  root: HTMLElement;
  messages: HTMLElement;
  jumpToLatest: HTMLButtonElement;
  composer: HTMLElement;
  textarea: HTMLTextAreaElement;
  sender: HTMLButtonElement;
  attachmentTray: HTMLElement;
  attach: HTMLButtonElement;
  send: HTMLButtonElement;
  announcer: HTMLElement;
  pendingAttachments: PendingAttachment[];
  draft: string;
  conversation: Conversation;
  component: Component;
  focused: boolean;
  sending: boolean;
  blurTimer: number;
  lastMessageCount: number;
  renderSignature: string;
  scrollAfterNextAppend: boolean;
  visibleStart: number;
  initialScrollPending: boolean;
  renderGeneration: number;
  resizeObserver: ResizeObserver;
}

interface PendingAttachment {
  id: string;
  file: File;
}

interface ScrollAnchor {
  messageIndex: string;
  offset: number;
}

type Frontmatter = Record<string, unknown>;

export const SOLOMON_CHAT_VIEW_TYPE = "solomon-chat-view";

class SolomonChatView extends TextFileView {
  private action: HTMLElement;

  constructor(leaf: WorkspaceLeaf, private owner: SolomonChatPlugin) {
    super(leaf);
    this.navigation = true;
    this.contentEl.addClass("solomon-chat-view-content");
    this.action = this.addAction("ellipsis", "Conversation actions", () => this.owner.openConversationActions(this.leaf, this.action));
  }

  getViewType(): string { return SOLOMON_CHAT_VIEW_TYPE; }
  getDisplayText(): string { return this.file?.basename || "Solomon Chat"; }
  getIcon(): string { return "messages-square"; }
  getViewData(): string { return this.data; }
  setViewData(data: string, clear: boolean): void {
    this.data = data;
    this.owner.renderViewData(this, data, clear);
  }
  clear(): void {
    this.data = "";
    this.owner.teardownView(this.leaf);
  }
  protected async onClose(): Promise<void> {
    this.owner.teardownView(this.leaf);
    this.contentEl.removeClass("solomon-chat-view-content");
    await super.onClose();
  }
}

interface SolomonPluginData {
  pendingAttachmentCleanups: PendingCleanupMap;
  version: 2;
  settings: SolomonSettings;
  drafts: DraftMap;
}

export default class SolomonChatPlugin extends Plugin {
  settings: SolomonSettings = { ...DEFAULT_SETTINGS };
  private drafts: DraftMap = {};
  private pendingAttachmentCleanups: PendingCleanupMap = {};
  private draftTimers = new Map<string, number>();
  private dataSaveQueue: Promise<void> = Promise.resolve();
  private states = new Map<WorkspaceLeaf, ViewState>();
  private inFlightFiles = new Set<TFile>();
  private reconcilingFiles = new Set<TFile>();
  private cleanupReconciliations = new Set<string>();
  private rawLeaves = new WeakMap<WorkspaceLeaf, string>();
  private routingLeaves = new WeakSet<WorkspaceLeaf>();
  private fileQueues = new Map<string, Promise<unknown>>();
  private refreshTokens = new WeakMap<WorkspaceLeaf, number>();
  private refreshTimers = new Map<WorkspaceLeaf, number>();
  private viewportFrame = 0;
  private viewportTimer = 0;

  async onload(): Promise<void> {
    const loaded = await this.loadData() as Record<string, unknown> | null;
    const nestedSettings = loaded?.settings && typeof loaded.settings === "object" && !Array.isArray(loaded.settings) ? loaded.settings : loaded;
    this.settings = this.parseSettings(nestedSettings);
    const draftContainer = loaded?.drafts;
    const storedDrafts = draftContainer && typeof draftContainer === "object" && !Array.isArray(draftContainer) && "drafts" in draftContainer
      ? (draftContainer as Record<string, unknown>).drafts
      : draftContainer;
    this.drafts = parseDraftMap(storedDrafts);
    this.pendingAttachmentCleanups = parsePendingCleanupMap(loaded?.pendingAttachmentCleanups);
    this.registerView(SOLOMON_CHAT_VIEW_TYPE, (leaf) => new SolomonChatView(leaf, this));
    this.addRibbonIcon("messages-square", "Create a conversation", () => this.openCreateModal());
    this.addCommand({ id: "create-conversation", name: "Create new conversation", callback: () => this.openCreateModal() });
    this.addCommand({ id: "edit-participants", name: "Edit conversation participants", checkCallback: (checking) => this.withActiveConversation(checking, (file) => this.openParticipantsModal(file)) });
    this.addCommand({ id: "switch-speaker", name: "Switch active speaker", checkCallback: (checking) => this.withActiveConversation(checking, (file) => void this.switchSpeaker(file)) });
    this.addCommand({ id: "toggle-raw-markdown", name: "Toggle chat and raw Markdown", checkCallback: (checking) => this.withActiveConversation(checking, (_file, leaf) => {
      if (!checking) void this.toggleRaw(leaf);
    }) });
    this.addCommand({ id: "open-chat-view", name: "Open in chat view", checkCallback: (checking) => this.withActiveConversation(checking, (file, leaf) => {
      if (!checking) void this.openChatFile(file, leaf);
    }) });
    this.addCommand({ id: "export-transcript", name: "Export readable transcript", checkCallback: (checking) => this.withActiveConversation(checking, (file) => void this.exportTranscript(file)) });
    this.addSettingTab(new SolomonSettingsTab(this.app, this));

    this.registerEvent(this.app.workspace.on("layout-change", () => this.scheduleAll()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.scheduleAll()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleAll()));
    this.registerEvent(this.app.vault.on("modify", (file) => file instanceof TFile && this.scheduleFile(file)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (!(file instanceof TFile)) return;
      const draftMoved = movePathDraft(this.drafts, oldPath, file.path);
      const cleanupMoved = movePathPendingCleanups(this.pendingAttachmentCleanups, oldPath, file.path);
      if (draftMoved || cleanupMoved) void this.savePluginData();
    }));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => this.scheduleFile(file)));
    this.registerDomEvent(window, "resize", () => this.scheduleViewport());
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.visibilityState === "hidden") void this.flushDrafts().catch((error) => console.error("Solomon Chat: draft flush failed", error));
    });
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
    for (const timer of this.draftTimers.values()) window.clearTimeout(timer);
    this.draftTimers.clear();
    for (const timer of this.refreshTimers.values()) window.clearTimeout(timer);
    this.refreshTimers.clear();
    void this.savePluginData().catch((error) => console.error("Solomon Chat: unload save failed", error));
    for (const leaf of [...this.states.keys()]) {
      const file = this.fileForLeaf(leaf);
      this.teardown(leaf);
      if (file && leaf.view instanceof SolomonChatView) void leaf.setViewState({ type: "markdown", state: { file: file.path } });
    }
  }

  async saveSettings(): Promise<void> { await this.savePluginData(); }

  refreshAllLeaves(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(SOLOMON_CHAT_VIEW_TYPE)) this.scheduleLeaf(leaf);
    void this.routeMarkdownLeaves();
  }

  private scheduleAll(): void {
    this.refreshAllLeaves();
    this.scheduleViewport();
  }

  private scheduleFile(file: TFile): void {
    if (file.extension !== "md") return;
    for (const leaf of this.app.workspace.getLeavesOfType(SOLOMON_CHAT_VIEW_TYPE)) {
      if (leaf.view instanceof SolomonChatView && leaf.view.file?.path === file.path) this.scheduleLeaf(leaf);
    }
    void this.routeMarkdownLeaves();
  }

  private scheduleLeaf(leaf: WorkspaceLeaf): void {
    window.clearTimeout(this.refreshTimers.get(leaf));
    this.refreshTimers.set(leaf, window.setTimeout(() => {
      this.refreshTimers.delete(leaf);
      void this.refreshLeaf(leaf);
    }, 24));
  }

  private async refreshLeaf(leaf: WorkspaceLeaf): Promise<void> {
    if (!(leaf.view instanceof SolomonChatView)) return;
    const file = leaf.view.file;
    if (!(file instanceof TFile) || file.extension !== "md") return this.teardown(leaf);
    const token = (this.refreshTokens.get(leaf) || 0) + 1;
    this.refreshTokens.set(leaf, token);
    const content = await this.app.vault.cachedRead(file);
    if (this.refreshTokens.get(leaf) !== token || !(leaf.view instanceof SolomonChatView) || leaf.view.file?.path !== file.path) return;
    const conversation = parseConversation(content, this.frontmatterFor(file), {
      leftName: this.settings.defaultLeftName,
      rightName: this.settings.defaultRightName,
      attachmentFolder: this.defaultAttachmentFolder(file),
    });
    if (!conversation.isConversation) return void this.openMarkdownFile(file, leaf);
    this.render(leaf, file, conversation);
  }

  renderViewData(view: SolomonChatView, data: string, _clear: boolean): void {
    const file = view.file;
    if (!(file instanceof TFile)) return;
    const conversation = parseConversation(data, this.frontmatterFor(file), {
      leftName: this.settings.defaultLeftName,
      rightName: this.settings.defaultRightName,
      attachmentFolder: this.defaultAttachmentFolder(file),
    });
    if (!conversation.isConversation) { void this.openMarkdownFile(file, view.leaf); return; }
    this.render(view.leaf, file, conversation);
  }

  teardownView(leaf: WorkspaceLeaf): void { this.teardown(leaf); }

  private async routeMarkdownLeaves(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (!(leaf.view instanceof MarkdownView) || this.routingLeaves.has(leaf)) continue;
      const file = leaf.view.file;
      if (!(file instanceof TFile) || file.extension !== "md") continue;
      if (this.rawLeaves.get(leaf) === file.path) continue;
      try {
        const content = await this.app.vault.cachedRead(file);
        if (!(leaf.view instanceof MarkdownView) || leaf.view.file?.path !== file.path) continue;
        const conversation = parseConversation(content, this.frontmatterFor(file), {
          leftName: this.settings.defaultLeftName,
          rightName: this.settings.defaultRightName,
          attachmentFolder: this.defaultAttachmentFolder(file),
        });
        if (shouldRouteToChat({ conversation: conversation.isConversation, filePath: file.path, markdownView: true, rawPath: this.rawLeaves.get(leaf), routing: this.routingLeaves.has(leaf) })) await this.openChatFile(file, leaf);
      } catch (error) { console.error("Solomon Chat: could not route a conversation view", error); }
    }
  }

  private async openChatFile(file: TFile, leaf: WorkspaceLeaf): Promise<void> {
    if (this.routingLeaves.has(leaf)) return;
    this.routingLeaves.add(leaf);
    this.rawLeaves.delete(leaf);
    try {
      await leaf.setViewState({ type: SOLOMON_CHAT_VIEW_TYPE, state: { file: file.path }, active: true });
    } finally { this.routingLeaves.delete(leaf); }
  }

  private async openMarkdownFile(file: TFile, leaf: WorkspaceLeaf): Promise<void> {
    if (this.routingLeaves.has(leaf)) return;
    this.routingLeaves.add(leaf);
    this.rawLeaves.set(leaf, file.path);
    this.teardown(leaf);
    try {
      await leaf.setViewState({ type: "markdown", state: { file: file.path, mode: "source" }, active: true });
    } finally { this.routingLeaves.delete(leaf); }
  }

  private fileForLeaf(leaf: WorkspaceLeaf): TFile | null {
    const view = leaf.view;
    return view instanceof SolomonChatView || view instanceof MarkdownView ? view.file : null;
  }

  private createState(leaf: WorkspaceLeaf, file: TFile, conversation: Conversation): ViewState {
    if (!(leaf.view instanceof SolomonChatView)) throw new Error("Solomon Chat requires its registered chat view");
    const host = leaf.view.contentEl;
    host.empty();
    const root = host.createDiv({ cls: "solomon-chat-root" });
    root.classList.toggle("is-mobile", Platform.isMobile);
    const messages = root.createDiv({ cls: "solomon-chat-messages", attr: { role: "log", "aria-label": "Conversation messages" } });
    const jumpToLatest = root.createEl("button", { cls: "solomon-chat-jump-latest", attr: { "aria-label": "Jump to latest message", "aria-hidden": "true" } });
    jumpToLatest.type = "button"; jumpToLatest.tabIndex = -1; setIcon(jumpToLatest, "arrow-down"); jumpToLatest.createSpan({ text: "Latest" });
    const announcer = root.createDiv({ cls: "solomon-chat-announcer", attr: { "aria-live": "polite", "aria-atomic": "true" } });
    const composer = root.createDiv({ cls: "solomon-chat-composer" });
    const composerContext = composer.createDiv({ cls: "solomon-chat-composer-context" });
    const sender = composerContext.createEl("button", { cls: "solomon-chat-sender" }); sender.type = "button";
    const attachmentTray = composer.createDiv({ cls: "solomon-chat-attachment-tray", attr: { "aria-label": "Files ready to send" } });
    const composeRow = composer.createDiv({ cls: "solomon-chat-compose-row" });
    const attach = composeRow.createEl("button", { cls: "solomon-chat-icon", attr: { "aria-label": "Add attachment" } }); attach.type = "button"; setIcon(attach, "plus");
    const textarea = composeRow.createEl("textarea", { attr: { rows: "1", enterkeyhint: Platform.isMobile ? "enter" : "send", autocapitalize: "sentences", placeholder: "Message…", "aria-label": "Message" } });
    const send = composeRow.createEl("button", { cls: "solomon-chat-send", attr: { "aria-label": "Send message" } }); send.type = "button"; setIcon(send, "arrow-up");
    const component = new Component(); component.load();
    const restoredDraft = this.restoreDraft(file, conversation);
    const resizeObserver = new ResizeObserver(() => this.scheduleViewport());
    resizeObserver.observe(root);
    const state: ViewState = { leaf, file, root, messages, jumpToLatest, composer, textarea, sender, attachmentTray, attach, send, announcer, pendingAttachments: [], draft: restoredDraft, conversation, component, focused: false, sending: this.isFileBusy(file), blurTimer: 0, lastMessageCount: 0, renderSignature: "", scrollAfterNextAppend: false, visibleStart: initialVisibleStart(conversation.messages.length), initialScrollPending: true, renderGeneration: 0, resizeObserver };

    textarea.addEventListener("input", () => { state.draft = textarea.value; this.rememberDraft(state); this.resizeTextarea(textarea); this.updateSendAvailability(state); });
    textarea.addEventListener("focus", () => { state.focused = true; this.applyViewport(state); });
    textarea.addEventListener("blur", () => {
      window.clearTimeout(state.blurTimer);
      state.blurTimer = window.setTimeout(() => { state.focused = state.textarea === document.activeElement; this.applyViewport(state); }, 140);
    });
    textarea.addEventListener("keydown", (event: KeyboardEvent) => {
      if (shouldSubmitComposerKey({ composing: event.isComposing, key: event.key, mobile: Platform.isMobile, shift: event.shiftKey })) { event.preventDefault(); void this.submit(state); }
    });
    send.addEventListener("pointerdown", (event: PointerEvent) => event.preventDefault());
    send.addEventListener("click", () => void this.submit(state));
    sender.addEventListener("pointerdown", (event: PointerEvent) => event.preventDefault());
    sender.addEventListener("click", () => void this.switchSpeaker(state.file));
    attach.addEventListener("pointerdown", (event: PointerEvent) => event.preventDefault());
    attach.addEventListener("click", () => void this.attachFiles(state));
    jumpToLatest.addEventListener("click", () => { this.setLatestVisible(state, false); messages.scrollTop = messages.scrollHeight; });
    messages.addEventListener("scroll", () => { if (this.isNearBottom(messages)) this.setLatestVisible(state, false); }, { passive: true });
    if (restoredDraft) window.setTimeout(() => { new Notice("Draft restored"); announcer.textContent = "Draft restored."; }, 0);
    return state;
  }

  private render(leaf: WorkspaceLeaf, file: TFile, conversation: Conversation): void {
    let state = this.states.get(leaf);
    const firstRender = !state;
    const oldPath = state?.file.path;
    const preserveFocus = state?.textarea === document.activeElement;
    const oldCount = state?.lastMessageCount || 0;
    const previousConversation = state?.conversation;
    const previousScrollTop = state?.messages.scrollTop || 0;
    const previousAnchor = state ? this.captureScrollAnchor(state) : null;
    const nearBottom = !state || this.isNearBottom(state.messages);
    if (!state) { state = this.createState(leaf, file, conversation); this.states.set(leaf, state); }
    if (oldPath && oldPath !== file.path) {
      state.draft = this.restoreDraft(file, conversation);
      state.pendingAttachments = [];
      state.scrollAfterNextAppend = false;
      state.initialScrollPending = true;
      if (state.draft) window.setTimeout(() => { new Notice("Draft restored"); state?.announcer.setText("Draft restored."); }, 0);
    }
    const renderSignature = `${this.settings.showTimestamps}|${conversation.leftName}|${conversation.rightName}`;
    const canReuseTranscript = !firstRender && oldPath === file.path && state.renderSignature === renderSignature
      && previousConversation?.preamble === conversation.preamble
      && oldCount <= conversation.messages.length
      && previousConversation.messages.every((message, index) => this.sameMessage(message, conversation.messages[index]));
    const appended = canReuseTranscript && conversation.messages.length > oldCount;
    state.file = file; state.conversation = conversation; state.renderSignature = renderSignature;
    state.sending = this.isFileBusy(file);
    const renderGeneration = ++state.renderGeneration;
    const renderTasks: Promise<void>[] = [];
    leaf.view.containerEl.addClass("solomon-chat-active");
    this.applyColors(state.root);
    this.updateSpeakerControls(state);
    if (!canReuseTranscript) {
      this.setLatestVisible(state, false);
      state.component.unload(); state.component = new Component(); state.component.load();
      state.visibleStart = firstRender || oldPath !== file.path
        ? initialVisibleStart(conversation.messages.length)
        : Math.min(state.visibleStart, initialVisibleStart(conversation.messages.length));
      renderTasks.push(...this.renderVisibleTranscript(state));
    } else if (appended) {
      for (let index = oldCount; index < conversation.messages.length; index++) renderTasks.push(this.renderMessage(state, index, true));
    }
    state.lastMessageCount = conversation.messages.length;
    state.textarea.value = state.draft;
    this.renderAttachmentTray(state);
    this.setSendingState(state, state.sending);
    this.resizeTextarea(state.textarea);
    this.applyViewport(state);
    const renderedState = state;
    void Promise.all(renderTasks).then(() => window.setTimeout(() => {
      if (renderedState.renderGeneration !== renderGeneration) return;
      if (renderedState.initialScrollPending || appended && (renderedState.scrollAfterNextAppend || nearBottom)) {
        renderedState.messages.scrollTop = renderedState.messages.scrollHeight;
        this.setLatestVisible(renderedState, false);
        renderedState.initialScrollPending = false;
      } else if (appended) {
        renderedState.messages.scrollTop = previousScrollTop;
        this.setLatestVisible(renderedState, true);
      } else if (!canReuseTranscript && !firstRender) {
        if (!this.restoreScrollAnchor(renderedState, previousAnchor)) renderedState.messages.scrollTop = Math.min(previousScrollTop, Math.max(0, renderedState.messages.scrollHeight - renderedState.messages.clientHeight));
      }
      renderedState.scrollAfterNextAppend = false;
      if (this.settings.autoFocusComposer && (firstRender && !Platform.isMobile || preserveFocus)) this.focusTextarea(renderedState.textarea);
    }, 0)).catch((error) => console.error("Solomon Chat: message rendering failed", error));
  }

  private sameMessage(left: ChatMessage, right: ChatMessage | undefined): boolean {
    return !!right && left.id === right.id && left.side === right.side && left.timestamp === right.timestamp && left.content === right.content;
  }

  private renderVisibleTranscript(state: ViewState): Promise<void>[] {
    const tasks: Promise<void>[] = [];
    state.messages.empty();
    if (state.conversation.preamble) {
      const preamble = state.messages.createDiv({ cls: "solomon-chat-preamble" });
      tasks.push(MarkdownRenderer.render(this.app, state.conversation.preamble, preamble, state.file.path, state.component));
    }
    if (!state.conversation.messages.length) {
      this.renderEmptyState(state);
      return tasks;
    }
    if (state.visibleStart > 0) {
      const earlier = earlierMessageCount(state.visibleStart);
      const loadEarlier = state.messages.createEl("button", {
        cls: "solomon-chat-load-earlier",
        text: `Show earlier messages (${earlier.toLocaleString()})`,
        attr: { "aria-label": `Show earlier messages. ${earlier.toLocaleString()} not currently displayed.` },
      });
      loadEarlier.type = "button";
      loadEarlier.addEventListener("click", () => this.loadEarlierMessages(state));
    }
    for (let index = state.visibleStart; index < state.conversation.messages.length; index++) tasks.push(this.renderMessage(state, index));
    return tasks;
  }

  private loadEarlierMessages(state: ViewState): void {
    if (state.visibleStart <= 0) return;
    const anchor = this.captureScrollAnchor(state);
    state.visibleStart = previousVisibleStart(state.visibleStart);
    state.component.unload(); state.component = new Component(); state.component.load();
    const tasks = this.renderVisibleTranscript(state);
    void Promise.all(tasks).then(() => window.setTimeout(() => {
      this.restoreScrollAnchor(state, anchor);
      state.announcer.textContent = "Earlier messages loaded.";
    }, 0)).catch((error) => console.error("Solomon Chat: earlier message rendering failed", error));
  }

  private isNearBottom(messages: HTMLElement): boolean {
    return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 80;
  }

  private captureScrollAnchor(state: ViewState): ScrollAnchor | null {
    const top = state.messages.getBoundingClientRect().top;
    const firstVisible = Array.from(state.messages.querySelectorAll<HTMLElement>(".solomon-chat-message"))
      .find((message) => message.getBoundingClientRect().bottom > top);
    return firstVisible?.dataset.messageIndex
      ? { messageIndex: firstVisible.dataset.messageIndex, offset: firstVisible.getBoundingClientRect().top - top }
      : null;
  }

  private restoreScrollAnchor(state: ViewState, anchor: ScrollAnchor | null): boolean {
    if (!anchor) return false;
    const target = state.messages.querySelector<HTMLElement>(`.solomon-chat-message[data-message-index="${anchor.messageIndex}"]`);
    if (!target) return false;
    const offsetNow = target.getBoundingClientRect().top - state.messages.getBoundingClientRect().top;
    state.messages.addClass("solomon-chat-restoring-anchor");
    state.messages.scrollTop += offsetNow - anchor.offset;
    state.messages.removeClass("solomon-chat-restoring-anchor");
    return true;
  }

  private setLatestVisible(state: ViewState, visible: boolean): void {
    state.root.toggleClass("has-latest", visible);
    state.jumpToLatest.toggleClass("is-visible", visible);
    state.jumpToLatest.tabIndex = visible ? 0 : -1;
    state.jumpToLatest.setAttribute("aria-hidden", String(!visible));
  }

  private updateSpeakerControls(state: ViewState): void {
    const active = state.conversation.nextSide;
    const activeName = active === "left" ? state.conversation.leftName : state.conversation.rightName;
    const otherName = active === "left" ? state.conversation.rightName : state.conversation.leftName;
    state.sender.textContent = `Send as ${activeName}`;
    state.sender.disabled = state.sending;
    state.sender.setAttribute("aria-label", `Sending as ${activeName}. Activate to switch to ${otherName}.`);
    state.textarea.placeholder = "Message…";
    state.send.setAttribute("aria-label", `Send as ${activeName}`);
  }

  openConversationActions(leaf: WorkspaceLeaf, anchor: HTMLElement): void {
    const state = this.states.get(leaf);
    if (state) this.openActionsMenu(state, anchor);
  }

  private openActionsMenu(state: ViewState, anchor: HTMLElement): void {
    const menu = new Menu();
    if (this.settings.showPerspectivePrompts) menu.addItem((item) => item.setTitle("Use a perspective prompt…").setIcon("sparkles").onClick(() => this.openPromptMenu(state, anchor)));
    menu.addItem((item) => item.setTitle("Edit participants").setIcon("users").onClick(() => this.openParticipantsModal(state.file)));
    menu.addItem((item) => item.setTitle("Edit raw Markdown").setIcon("file-pen-line").onClick(() => this.toggleRaw(state.leaf)));
    menu.addItem((item) => item.setTitle("Export transcript").setIcon("download").onClick(() => void this.exportTranscript(state.file)));
    const rect = anchor.getBoundingClientRect();
    const rootRect = state.root.getBoundingClientRect();
    menu.showAtPosition({ x: Math.max(rootRect.left + 8, Math.min(rect.right - 220, rootRect.right - 228)), y: Math.min(rect.bottom + 4, window.innerHeight - 56) });
  }

  private renderEmptyState(state: ViewState): void {
    const empty = state.messages.createDiv({ cls: "solomon-chat-empty" });
    empty.createEl("h3", { text: "Start with what’s on your mind" });
    empty.createEl("p", { text: "Then switch sides and answer as if you were advising someone you care about." });
    const prompt = empty.createEl("button", { text: "Use a perspective prompt" });
    prompt.addEventListener("click", () => this.openPromptMenu(state));
  }

  private renderMessage(state: ViewState, index: number, animate = false): Promise<void> {
    const message = state.conversation.messages[index];
    const previous = state.conversation.messages[index - 1];
    const next = state.conversation.messages[index + 1];
    const groupedBefore = previous?.side === message.side;
    const groupedAfter = next?.side === message.side;
    if (groupedBefore) state.messages.querySelector<HTMLElement>(`.solomon-chat-message[data-message-index="${index - 1}"]`)?.addClass("is-grouped-after");
    const wrapper = state.messages.createDiv({
      cls: `solomon-chat-message is-${message.side}${groupedBefore ? " is-grouped-before" : ""}${groupedAfter ? " is-grouped-after" : ""}${animate ? " is-entering" : ""}`,
      attr: { role: "article", "data-message-index": String(index), "data-message-id": message.id || "" },
    });
    const name = message.side === "left" ? state.conversation.leftName : state.conversation.rightName;
    wrapper.setAttribute("aria-label", `Message from ${name}${message.timestamp ? ` at ${this.formatTimestamp(message.timestamp)}` : ""}`);
    if (this.settings.showTimestamps && !groupedBefore) wrapper.createDiv({ cls: "solomon-chat-meta", text: message.timestamp ? `${name} · ${this.formatTimestamp(message.timestamp)}` : name });
    const row = wrapper.createDiv({ cls: "solomon-chat-message-row" });
    const bubble = row.createDiv({ cls: "solomon-chat-bubble" });
    const rendered = MarkdownRenderer.render(this.app, message.content || " ", bubble, state.file.path, state.component).then(() => this.wireLinks(bubble, state.file.path));
    const actions = row.createDiv({ cls: "solomon-chat-message-actions" });
    const actionButton = actions.createEl("button", { cls: "solomon-chat-message-action", attr: { "aria-label": `Actions for ${name}'s message`, "aria-haspopup": "menu" } });
    actionButton.type = "button";
    setIcon(actionButton, "ellipsis");
    const populateMenu = (menu: Menu) => {
      menu.addItem((item) => item.setTitle("Edit message").setIcon("pencil").onClick(() => this.openEditModal(state.file, message)));
      menu.addItem((item) => item.setTitle("Delete message…").setIcon("trash-2").onClick(() => this.openDeleteModal(state.file, message)));
    };
    const showAtButton = () => {
      const menu = new Menu(); populateMenu(menu);
      const rect = actionButton.getBoundingClientRect();
      const width = Math.min(220, Math.max(160, state.root.clientWidth - 16));
      const rootRect = state.root.getBoundingClientRect();
      const preferred = message.side === "right" ? rect.right - width : rect.left;
      const x = Math.max(rootRect.left + 8, Math.min(preferred, rootRect.right - width - 8));
      menu.showAtPosition({ x, y: Math.min(rect.bottom + 2, window.innerHeight - 56) });
    };
    const showMenu = (event: MouseEvent) => { event.preventDefault(); const menu = new Menu();
      populateMenu(menu);
      menu.showAtMouseEvent(event);
    };
    actionButton.addEventListener("click", (event) => { event.stopPropagation(); wrapper.addClass("is-actions-visible"); showAtButton(); });
    bubble.addEventListener("click", (event) => {
      const selection = window.getSelection();
      if ((event.target as HTMLElement).closest("a, button, input, textarea") || selection && !selection.isCollapsed) return;
      for (const visible of Array.from(state.messages.querySelectorAll<HTMLElement>(".solomon-chat-message.is-actions-visible"))) if (visible !== wrapper) visible.removeClass("is-actions-visible");
      wrapper.toggleClass("is-actions-visible", !wrapper.hasClass("is-actions-visible"));
    });
    bubble.addEventListener("contextmenu", showMenu);
    let timer = 0; let startX = 0; let startY = 0;
    bubble.addEventListener("touchstart", (event) => { const touch = event.touches[0]; startX = touch.clientX; startY = touch.clientY; timer = window.setTimeout(() => showMenu(new MouseEvent("contextmenu", { clientX: startX, clientY: startY })), 550); }, { passive: true });
    const cancel = () => { if (timer) window.clearTimeout(timer); timer = 0; };
    bubble.addEventListener("touchend", cancel); bubble.addEventListener("touchcancel", cancel);
    bubble.addEventListener("touchmove", (event) => { const touch = event.touches[0]; if (Math.abs(touch.clientX - startX) > 8 || Math.abs(touch.clientY - startY) > 8) cancel(); }, { passive: true });
    return rendered;
  }

  private async submit(state: ViewState): Promise<void> {
    const draft = state.textarea.value;
    const pending = [...state.pendingAttachments];
    if ((!draft.trim() && !pending.length) || state.sending) return;
    const file = state.file;
    if (this.inFlightFiles.has(file)) return;
    const filePath = file.path;
    const conversationIdBeforeSend = state.conversation.conversationId;
    const conversationId = conversationIdBeforeSend || this.newId("conversation");
    const leftName = state.conversation.leftName;
    const rightName = state.conversation.rightName;
    const side = state.conversation.nextSide;
    const senderName = side === "left" ? leftName : rightName;
    const attachmentFolder = state.conversation.attachmentFolder || this.defaultAttachmentFolder(file);
    const messageId = this.newId("msg");
    const attachmentOperationFolder = pending.length ? this.attachmentOperationFolder(attachmentFolder, messageId) : "";
    const timestamp = currentTimestamp();
    const draftKeyBeforeSend = draftKey(conversationIdBeforeSend, filePath);
    this.inFlightFiles.add(file); this.refreshFileSendingState(file);
    state.scrollAfterNextAppend = true;
    let committed = false;
    try {
      await this.markDraftSending(draftKeyBeforeSend, draft, messageId);
      await this.queue(filePath, async () => {
        const imported: Array<{ file: File; target: string }> = [];
        if (pending.length) await this.ensureFolder(attachmentOperationFolder);
        for (const attachment of pending) {
          const target = await this.availablePath(attachmentOperationFolder, this.safeName(attachment.file.name, true), "");
          await this.app.vault.createBinary(target, await attachment.file.arrayBuffer());
          imported.push({ file: attachment.file, target });
        }
        await this.app.vault.process(file, (content) => {
          const links = imported.map(({ file: importedFile, target }) => attachmentMarkdown(importedFile, this.relativePath(this.parentPath(file.path), target)));
          const message = [draft.trimEnd(), links.join("\n")].filter(Boolean).join("\n\n");
          return appendMessageTransaction(content, {
            side,
            nextSide: side === "left" ? "right" : "left",
            timestamp,
            message,
            messageId,
            senderName,
            conversationId,
            leftName,
            rightName,
            attachmentFolder,
          });
        });
        committed = true;
      });
    } catch (error) {
      console.error("Solomon Chat: send failed", error);
      if (!committed) {
        try { committed = hasMessageId(await this.app.vault.read(file), messageId); }
        catch (readError) { console.error("Solomon Chat: could not reconcile the failed send", readError); }
      }
      if (!committed) {
        const cleanupFailed = await this.removeAttachmentOperationFolder(attachmentFolder, messageId);
        const recoveryKey = draftKey(conversationIdBeforeSend, file.path);
        if (cleanupFailed) this.rememberPendingAttachmentCleanup(recoveryKey, messageId);
        await this.clearSendingDraftMarker(draftKeyBeforeSend, recoveryKey, draft, messageId);
        new Notice(cleanupFailed ? "The message was not sent. Your text and files are still ready; copied files will be cleaned up when this conversation reopens." : "The message was not sent. Your text and files are still ready.");
        return;
      }
    } finally {
      if (!committed) {
        this.finishFileSend(file); state.scrollAfterNextAppend = false;
      }
    }

    try {
      let draftCleanupFailed = false;
      try { await this.clearDrafts([this.findSendingDraftKey(messageId, draftKeyBeforeSend), draftKeyBeforeSend, draftKey(conversationId, filePath), draftKey(conversationId, file.path), draftKey("", file.path)]); }
      catch (error) { draftCleanupFailed = true; console.error("Solomon Chat: sent-message draft cleanup failed", error); }

      if (state.file === file) {
        state.conversation.conversationId = conversationId;
        state.draft = ""; state.textarea.value = "";
        state.pendingAttachments = state.pendingAttachments.filter((item) => !pending.some((sent) => sent.id === item.id));
        state.conversation.nextSide = side === "left" ? "right" : "left";
        this.updateSpeakerControls(state); this.renderAttachmentTray(state); this.resizeTextarea(state.textarea); this.focusTextarea(state.textarea);
        state.announcer.textContent = `Message sent as ${senderName}${pending.length ? ` with ${pending.length} ${pending.length === 1 ? "file" : "files"}` : ""}.`;
      }
      if (draftCleanupFailed) new Notice("Message sent. Draft cleanup will be reconciled when this conversation is reopened.");
    } finally {
      this.finishFileSend(file);
      if (state.file !== file || state.textarea.value) state.scrollAfterNextAppend = false;
    }
  }

  private async switchSpeaker(file: TFile, requestedSide?: Side): Promise<void> {
    const visibleStates = [...this.states.values()].filter((state) => state.file.path === file.path);
    if (this.isFileBusy(file) || visibleStates.some((state) => state.sending)) return;
    const visibleSide = visibleStates[0]?.conversation.nextSide;
    const cachedSide = this.frontmatterFor(file)[FM.nextSide];
    const target: Side = requestedSide || ((visibleSide || cachedSide) === "left" ? "right" : "left");
    if (visibleSide === target) {
      const current = visibleStates[0];
      if (current) this.focusTextarea(current.textarea);
      return;
    }
    for (const state of visibleStates) {
      state.conversation.nextSide = target;
      this.updateSpeakerControls(state);
    }
    await this.queue(file.path, async () => this.app.fileManager.processFrontMatter(file, (fm: Frontmatter) => {
      this.ensureFrontmatter(fm, file, target);
    }));
    this.scheduleFile(file);
    window.setTimeout(() => { const state = [...this.states.values()].find((item) => item.file.path === file.path); if (state) this.focusTextarea(state.textarea); }, 0);
  }

  private openPromptMenu(state: ViewState, anchor: HTMLElement = state.sender): void {
    const menu = new Menu();
    for (const prompt of PERSPECTIVE_PROMPTS) menu.addItem((item) => item.setTitle(prompt).onClick(() => {
      state.textarea.value = state.textarea.value.trim() ? `${state.textarea.value.trimEnd()}\n\n${prompt}` : prompt;
      state.draft = state.textarea.value; this.rememberDraft(state); state.send.disabled = false; this.resizeTextarea(state.textarea); this.focusTextarea(state.textarea);
    }));
    const rect = anchor.getBoundingClientRect();
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

  private openEditModal(file: TFile, target: ChatMessage): void {
    new FormModal(this.app, { title: "Edit message", initial: { content: target.content }, fields: [{ key: "content", name: "Message", type: "textarea" }], onSubmit: async (values) => {
      if (!values.content.trim()) { new Notice("A message cannot be empty. Delete it instead."); return false; }
      await this.queue(file.path, async () => this.app.vault.process(file, (existing) => replaceTargetMessage(existing, target, values.content)));
    } }).open();
  }

  private openDeleteModal(file: TFile, target: ChatMessage): void {
    const preview = target.content.replace(/\s+/g, " ").trim();
    new ConfirmModal(this.app, {
      title: "Delete this message?",
      message: "This removes the message from the Markdown conversation. Attached files stay in the vault.",
      preview: preview.length > 140 ? `${preview.slice(0, 139)}…` : preview,
      confirmLabel: "Delete message",
      onConfirm: async () => {
        await this.queue(file.path, async () => this.app.vault.process(file, (existing) => replaceTargetMessage(existing, target, null)));
        new Notice("Message deleted");
      },
    }).open();
  }

  private async createConversation(title: string, left: string, right: string): Promise<void> {
    const folder = normalizePath(this.settings.conversationFolder || "");
    await this.ensureFolder(folder);
    const base = this.safeName(title || "New Conversation");
    const path = await this.availablePath(folder, base, ".md");
    const attachmentFolder = normalizePath(`${this.parentPath(path) ? `${this.parentPath(path)}/` : ""}${this.basename(path)}.attachments`);
    const yaml = ["---", `${FM.flag}: true`, `${FM.conversationId}: ${this.yaml(this.newId("conversation"))}`, `${FM.leftName}: ${this.yaml(left.trim() || this.settings.defaultLeftName)}`, `${FM.rightName}: ${this.yaml(right.trim() || this.settings.defaultRightName)}`, `${FM.nextSide}: right`, `${FM.attachmentFolder}: ${this.yaml(attachmentFolder)}`, "---", ""].join("\n");
    const file = await this.app.vault.create(path, yaml);
    await this.openChatFile(file, this.app.workspace.getLeaf(false));
  }

  private async attachFiles(state: ViewState): Promise<void> {
    if (state.sending || state.attach.disabled) return;
    state.attach.disabled = true;
    try {
      const selected = await this.pickFiles();
      if (!selected.length) return;
      const validationError = attachmentValidationError(selected, state.pendingAttachments.map((item) => item.file));
      if (validationError) { new Notice(validationError); return; }
      state.pendingAttachments.push(...selected.map((file) => ({ id: this.newId("attachment"), file })));
      this.renderAttachmentTray(state); this.updateSendAvailability(state);
      state.announcer.textContent = `${selected.length} ${selected.length === 1 ? "file" : "files"} ready to send.`;
      this.focusTextarea(state.textarea);
    } catch (error) { console.error("Solomon Chat: file picker failed", error); new Notice("Could not open the file picker."); }
    finally { state.attach.disabled = state.sending; }
  }

  private pickFiles(): Promise<File[]> {
    const input = document.body.createEl("input", { attr: { type: "file", multiple: "", hidden: "" } });
    input.multiple = true;
    return new Promise((resolve) => {
      let settled = false; let fallbackTimer = 0;
      const cleanup = () => {
        window.clearTimeout(fallbackTimer);
        input.removeEventListener("change", changed); input.removeEventListener("cancel", cancelled);
        window.removeEventListener("focus", returned); document.removeEventListener("visibilitychange", visibilityChanged);
        input.remove();
      };
      const finish = (files: File[]) => { if (settled) return; settled = true; cleanup(); resolve(files); };
      const changed = () => finish(Array.from(input.files || []));
      const cancelled = () => finish([]);
      const scheduleFallback = () => {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = window.setTimeout(() => { if (!settled) finish(Array.from(input.files || [])); }, 500);
      };
      const returned = () => scheduleFallback();
      const visibilityChanged = () => { if (document.visibilityState === "visible") scheduleFallback(); };
      input.addEventListener("change", changed); input.addEventListener("cancel", cancelled);
      window.addEventListener("focus", returned); document.addEventListener("visibilitychange", visibilityChanged);
      try { input.click(); } catch (error) { cleanup(); throw error; }
    });
  }

  private renderAttachmentTray(state: ViewState): void {
    state.attachmentTray.empty();
    state.attachmentTray.toggleClass("is-visible", state.pendingAttachments.length > 0);
    for (const attachment of state.pendingAttachments) {
      const chip = state.attachmentTray.createDiv({ cls: "solomon-chat-attachment" });
      const icon = chip.createSpan({ cls: "solomon-chat-attachment-icon", attr: { "aria-hidden": "true" } });
      setIcon(icon, isImageAttachment(attachment.file) ? "image" : "file");
      const details = chip.createDiv({ cls: "solomon-chat-attachment-details" });
      details.createSpan({ cls: "solomon-chat-attachment-name", text: attachment.file.name });
      details.createSpan({ cls: "solomon-chat-attachment-size", text: formatAttachmentSize(attachment.file.size) });
      const remove = chip.createEl("button", { cls: "solomon-chat-attachment-remove", attr: { "aria-label": `Remove ${attachment.file.name}` } });
      remove.type = "button"; remove.disabled = state.sending; setIcon(remove, "x");
      remove.addEventListener("click", () => {
        if (state.sending) return;
        state.pendingAttachments = state.pendingAttachments.filter((item) => item.id !== attachment.id);
        this.renderAttachmentTray(state); this.updateSendAvailability(state);
        state.announcer.textContent = `${attachment.file.name} removed.`;
      });
    }
  }

  private updateSendAvailability(state: ViewState): void {
    state.send.disabled = state.sending || (!state.textarea.value.trim() && !state.pendingAttachments.length);
  }

  private setSendingState(state: ViewState, sending: boolean): void {
    state.composer.ariaBusy = String(sending);
    state.textarea.readOnly = sending;
    state.attach.disabled = sending;
    state.sender.disabled = sending;
    setIcon(state.send, sending ? "loader-circle" : "arrow-up");
    state.send.toggleClass("is-sending", sending);
    state.send.setAttribute("aria-label", sending ? "Sending message" : `Send as ${state.conversation.nextSide === "left" ? state.conversation.leftName : state.conversation.rightName}`);
    this.renderAttachmentTray(state); this.updateSendAvailability(state);
  }

  private isFileBusy(file: TFile): boolean {
    return this.inFlightFiles.has(file) || this.reconcilingFiles.has(file);
  }

  private refreshFileSendingState(file: TFile): void {
    const sending = this.isFileBusy(file);
    for (const state of this.states.values()) {
      if (state.file !== file) continue;
      state.sending = sending;
      this.setSendingState(state, sending);
    }
  }

  private finishFileSend(file: TFile): void {
    this.inFlightFiles.delete(file);
    this.refreshFileSendingState(file);
  }

  private async removeAttachmentOperationFolder(attachmentRoot: string, messageId: string): Promise<boolean> {
    const path = this.attachmentOperationFolder(attachmentRoot, messageId);
    if (!path) return false;
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!folder) return false;
    if (!(folder instanceof TFolder) || folder.path !== path || folder.name !== messageId) {
      console.error(`Solomon Chat: refused to clean up an unexpected attachment path: ${path}`);
      return true;
    }
    try { await this.app.fileManager.trashFile(folder); return false; }
    catch (error) { console.error(`Solomon Chat: could not clean up ${path}`, error); return true; }
  }

  private rememberDraft(state: ViewState): void {
    const key = draftKey(state.conversation.conversationId, state.file.path);
    if (state.draft) this.drafts[key] = { version: 1, text: state.draft, updatedAt: Date.now() };
    else delete this.drafts[key];
    window.clearTimeout(this.draftTimers.get(key));
    this.draftTimers.set(key, window.setTimeout(() => {
      this.draftTimers.delete(key); void this.savePluginData();
    }, 400));
  }

  private restoreDraft(file: TFile, conversation: Conversation): string {
    const primaryKey = draftKey(conversation.conversationId, file.path);
    const legacyPathKey = conversation.conversationId ? draftKey("", file.path) : primaryKey;
    const attachmentRoot = conversation.attachmentFolder || this.defaultAttachmentFolder(file);
    void this.reconcilePendingAttachmentCleanups([primaryKey, legacyPathKey], attachmentRoot);
    const key = this.drafts[primaryKey] ? primaryKey : legacyPathKey;
    const record = this.drafts[key];
    if (!record?.sendingMessageId) return record?.text || "";
    if (this.isFileBusy(file)) return record.text;
    const committed = conversation.messages.some((message) => message.id === record.sendingMessageId);
    const messageId = record.sendingMessageId;
    if (committed) {
      delete this.drafts[key];
      window.clearTimeout(this.draftTimers.get(key)); this.draftTimers.delete(key);
      void this.savePluginData().catch((error) => console.error("Solomon Chat: draft reconciliation failed", error));
    } else {
      const operationFolder = this.attachmentOperationFolder(attachmentRoot, messageId);
      if (operationFolder && this.app.vault.getAbstractFileByPath(operationFolder)) new Notice("Recovered unsent text after an interrupted send. Please reattach the files.");
      this.reconcilingFiles.add(file);
      void this.reconcileInterruptedSend(file, key, record.text, messageId, attachmentRoot);
    }
    return committed ? "" : record.text;
  }

  private async markDraftSending(key: string, text: string, messageId: string): Promise<void> {
    const previous = this.drafts[key] ? { ...this.drafts[key] } : undefined;
    window.clearTimeout(this.draftTimers.get(key)); this.draftTimers.delete(key);
    this.drafts[key] = { version: 1, text, updatedAt: Date.now(), sendingMessageId: messageId };
    try { await this.savePluginData(); }
    catch (error) {
      if (previous) this.drafts[key] = previous; else delete this.drafts[key];
      throw error;
    }
  }

  private findSendingDraftKey(messageId: string, fallbackKey: string): string {
    return Object.entries(this.drafts).find(([, record]) => record.sendingMessageId === messageId)?.[0] || fallbackKey;
  }

  private async clearSendingDraftMarker(key: string, recoveryKey: string, text: string, messageId: string): Promise<void> {
    const actualKey = this.findSendingDraftKey(messageId, key);
    delete this.drafts[actualKey];
    if (text) this.drafts[recoveryKey] = { version: 1, text, updatedAt: Date.now() };
    else delete this.drafts[recoveryKey];
    try { await this.savePluginData(); }
    catch (error) { console.error("Solomon Chat: failed-send draft reconciliation could not be saved", error); }
  }

  private async reconcileInterruptedSend(file: TFile, key: string, text: string, messageId: string, attachmentRoot: string): Promise<void> {
    try {
      const cleanupFailed = await this.removeAttachmentOperationFolder(attachmentRoot, messageId);
      const actualKey = this.findSendingDraftKey(messageId, key);
      const record = this.drafts[actualKey];
      if (!record || record.sendingMessageId !== messageId) return;
      if (cleanupFailed) this.rememberPendingAttachmentCleanup(actualKey, messageId);
      if (text) this.drafts[actualKey] = { version: 1, text, updatedAt: Date.now() };
      else delete this.drafts[actualKey];
      window.clearTimeout(this.draftTimers.get(actualKey)); this.draftTimers.delete(actualKey);
      try { await this.savePluginData(); }
      catch (error) { console.error("Solomon Chat: interrupted-send reconciliation failed", error); }
    } finally {
      this.reconcilingFiles.delete(file);
      this.refreshFileSendingState(file);
    }
  }

  private rememberPendingAttachmentCleanup(key: string, messageId: string): void {
    if (!/^msg-[0-9a-f]{16}$/i.test(messageId)) return;
    this.pendingAttachmentCleanups[key] = [...new Set([...(this.pendingAttachmentCleanups[key] || []), messageId])];
  }

  private async reconcilePendingAttachmentCleanups(keys: string[], attachmentRoot: string): Promise<void> {
    let changed = false;
    for (const key of new Set(keys)) {
      const messageIds = this.pendingAttachmentCleanups[key] || [];
      const remaining: string[] = [];
      for (const messageId of messageIds) {
        const reconciliationKey = `${attachmentRoot}|${messageId}`;
        if (this.cleanupReconciliations.has(reconciliationKey)) { remaining.push(messageId); continue; }
        this.cleanupReconciliations.add(reconciliationKey);
        try {
          if (await this.removeAttachmentOperationFolder(attachmentRoot, messageId)) remaining.push(messageId);
          else changed = true;
        } finally { this.cleanupReconciliations.delete(reconciliationKey); }
      }
      if (remaining.length) this.pendingAttachmentCleanups[key] = remaining;
      else if (messageIds.length) delete this.pendingAttachmentCleanups[key];
    }
    if (changed) await this.savePluginData().catch((error) => console.error("Solomon Chat: attachment cleanup reconciliation failed", error));
  }

  private async clearDrafts(keys: string[]): Promise<void> {
    for (const key of new Set(keys)) {
      window.clearTimeout(this.draftTimers.get(key)); this.draftTimers.delete(key); delete this.drafts[key];
    }
    await this.savePluginData();
  }

  private async flushDrafts(): Promise<void> {
    for (const timer of this.draftTimers.values()) window.clearTimeout(timer);
    this.draftTimers.clear();
    await this.savePluginData();
  }

  private savePluginData(): Promise<void> {
    const payload: SolomonPluginData = {
      pendingAttachmentCleanups: Object.fromEntries(Object.entries(this.pendingAttachmentCleanups).map(([key, value]) => [key, [...value]])),
      version: 2,
      settings: { ...this.settings },
      drafts: Object.fromEntries(Object.entries(this.drafts).map(([key, value]) => [key, { ...value }])),
    };
    const next = this.dataSaveQueue.catch(() => undefined).then(() => this.saveData(payload));
    this.dataSaveQueue = next;
    return next;
  }

  private async toggleRaw(leaf: WorkspaceLeaf): Promise<void> {
    const file = this.fileForLeaf(leaf);
    if (!(file instanceof TFile)) return;
    if (this.isFileBusy(file)) { new Notice("Wait for the current send to finish before opening raw Markdown."); return; }
    if (leaf.view instanceof SolomonChatView) await this.openMarkdownFile(file, leaf);
    else await this.openChatFile(file, leaf);
  }

  private async exportTranscript(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    const conversation = parseConversation(content, this.frontmatterFor(file), { leftName: this.settings.defaultLeftName, rightName: this.settings.defaultRightName, attachmentFolder: this.defaultAttachmentFolder(file) });
    const text = conversation.messages.map((message) => `${message.side === "left" ? conversation.leftName : conversation.rightName}${message.timestamp ? ` - ${message.timestamp}` : ""}\n${message.content}`).join("\n\n");
    const path = await this.availablePath(this.parentPath(file.path), `${file.basename} - Transcript`, ".txt");
    await this.app.vault.create(path, `${text}\n`); new Notice(`Transcript saved to ${path}`);
  }

  private teardown(leaf: WorkspaceLeaf): void {
    window.clearTimeout(this.refreshTimers.get(leaf)); this.refreshTimers.delete(leaf);
    const state = this.states.get(leaf); if (!state) return;
    window.clearTimeout(state.blurTimer); state.resizeObserver.disconnect(); state.component.unload(); state.root.remove(); leaf.view.containerEl.removeClass("solomon-chat-active"); this.states.delete(leaf);
  }

  private scheduleViewport(): void {
    if (!this.viewportFrame) this.viewportFrame = window.requestAnimationFrame(() => { this.viewportFrame = 0; for (const state of this.states.values()) this.applyViewport(state); });
    window.clearTimeout(this.viewportTimer); this.viewportTimer = window.setTimeout(() => { this.viewportTimer = 0; for (const state of this.states.values()) this.applyViewport(state); }, 160);
  }

  private applyViewport(state: ViewState): void {
    if (!state.root.isConnected) return;
    const vv = window.visualViewport; const rect = state.root.getBoundingClientRect();
    const focused = state.focused || state.composer.contains(document.activeElement);
    const layout = calculateViewportLayout({ mobile: Platform.isMobile, focused, layoutHeight: window.innerHeight, visualHeight: vv?.height || window.innerHeight, visualOffsetTop: vv?.offsetTop || 0, containerBottom: rect.bottom, closedToolbarClearance: 0 });
    state.root.classList.toggle("is-compose-mode", layout.composeMode); state.root.classList.toggle("is-keyboard-open", layout.keyboardOpen);
    state.root.setCssProps({ "--solomon-top-clearance": "0px", "--solomon-bottom-clearance": `${layout.bottomClearance}px` });
  }

  private applyColors(root: HTMLElement): void {
    const keys = ["--solomon-left-bubble", "--solomon-right-bubble", "--solomon-left-text", "--solomon-right-text"];
    if (this.settings.useThemeColors) keys.forEach((key) => root.style.removeProperty(key));
    else { root.style.setProperty(keys[0], this.settings.leftBubbleColor); root.style.setProperty(keys[1], this.settings.rightBubbleColor); root.style.setProperty(keys[2], this.settings.leftTextColor); root.style.setProperty(keys[3], this.settings.rightTextColor); }
  }

  private wireLinks(container: HTMLElement, source: string): void {
    container.querySelectorAll<HTMLAnchorElement>("a.internal-link").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); void this.app.workspace.openLinkText(link.dataset.href || link.getAttribute("href") || "", source, event.ctrlKey || event.metaKey); }));
  }

  private iconButton(parent: HTMLElement, icon: string, label: string, action: () => void): HTMLButtonElement {
    const button = parent.createEl("button", { cls: "solomon-chat-icon", attr: { "aria-label": label, "data-tooltip-position": "bottom" } }); button.type = "button"; setIcon(button, icon); button.addEventListener("click", action); return button;
  }

  private withActiveConversation(checking: boolean, action: (file: TFile, leaf: WorkspaceLeaf) => void): boolean {
    const leaf = this.app.workspace.getLeaf(false);
    const file = this.fileForLeaf(leaf);
    if (!(file instanceof TFile)) return false;
    const fm = this.frontmatterFor(file);
    if (!fm[FM.flag]) return false; if (!checking) action(file, leaf); return true;
  }

  private ensureFrontmatter(fm: Frontmatter, file: TFile, side: Side): void {
    fm[FM.flag] = true;
    if (!this.frontmatterString(fm, FM.leftName)) fm[FM.leftName] = this.settings.defaultLeftName;
    if (!this.frontmatterString(fm, FM.rightName)) fm[FM.rightName] = this.settings.defaultRightName;
    fm[FM.nextSide] = side;
    if (!this.frontmatterString(fm, FM.attachmentFolder)) fm[FM.attachmentFolder] = this.defaultAttachmentFolder(file);
  }
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
  private attachmentOperationFolder(attachmentRoot: string, messageId: string): string { return /^msg-[0-9a-f]{16}$/i.test(messageId) ? normalizePath(`${attachmentRoot}/${messageId}`) : ""; }
  private async availablePath(folder: string, name: string, extension: string): Promise<string> { let index = 1; let candidate = ""; do { const suffix = index === 1 ? "" : ` ${index}`; candidate = normalizePath(`${folder ? `${folder}/` : ""}${extension ? name : name.replace(/\.[^.]+$/, "")}${suffix}${extension || (name.match(/\.[^.]+$/)?.[0] || "")}`); index++; } while (this.app.vault.getAbstractFileByPath(candidate)); return candidate; }
  private relativePath(fromFolder: string, target: string): string { const from = normalizePath(fromFolder).split("/").filter(Boolean); const to = normalizePath(target).split("/").filter(Boolean); let shared = 0; while (from[shared] === to[shared] && shared < from.length && shared < to.length) shared++; return [...from.slice(shared).map(() => ".."), ...to.slice(shared)].join("/"); }
  private newId(prefix: string): string { return `${prefix}-${window.crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`; }
  private parseSettings(value: unknown): SolomonSettings {
    const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    return {
      defaultLeftName: typeof record.defaultLeftName === "string" ? record.defaultLeftName : DEFAULT_SETTINGS.defaultLeftName,
      defaultRightName: typeof record.defaultRightName === "string" ? record.defaultRightName : DEFAULT_SETTINGS.defaultRightName,
      conversationFolder: typeof record.conversationFolder === "string" ? record.conversationFolder : DEFAULT_SETTINGS.conversationFolder,
      useThemeColors: typeof record.useThemeColors === "boolean" ? record.useThemeColors : DEFAULT_SETTINGS.useThemeColors,
      leftBubbleColor: typeof record.leftBubbleColor === "string" ? record.leftBubbleColor : DEFAULT_SETTINGS.leftBubbleColor,
      rightBubbleColor: typeof record.rightBubbleColor === "string" ? record.rightBubbleColor : DEFAULT_SETTINGS.rightBubbleColor,
      leftTextColor: typeof record.leftTextColor === "string" ? record.leftTextColor : DEFAULT_SETTINGS.leftTextColor,
      rightTextColor: typeof record.rightTextColor === "string" ? record.rightTextColor : DEFAULT_SETTINGS.rightTextColor,
      showTimestamps: typeof record.showTimestamps === "boolean" ? record.showTimestamps : DEFAULT_SETTINGS.showTimestamps,
      autoFocusComposer: typeof record.autoFocusComposer === "boolean" ? record.autoFocusComposer : DEFAULT_SETTINGS.autoFocusComposer,
      showPerspectivePrompts: typeof record.showPerspectivePrompts === "boolean" ? record.showPerspectivePrompts : DEFAULT_SETTINGS.showPerspectivePrompts,
    };
  }
  private frontmatterFor(file: TFile): Frontmatter { return Object.assign({}, this.app.metadataCache.getFileCache(file)?.frontmatter); }
  private frontmatterString(fm: Frontmatter, key: string): string { const value = fm[key]; return typeof value === "string" ? value.trim() : ""; }
}
