"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => main_default
});
module.exports = __toCommonJS(main_exports);

// src/plugin.ts
var import_obsidian3 = require("obsidian");

// src/constants.ts
var FM = {
  flag: "solomon-chat",
  leftName: "left-name",
  rightName: "right-name",
  nextSide: "next-side",
  attachmentFolder: "attachment-folder",
  leftBio: "left-bio",
  rightBio: "right-bio",
  leftAvatar: "left-avatar",
  rightAvatar: "right-avatar"
};
var DEFAULT_SETTINGS = {
  defaultLeftName: "Wise Friend",
  defaultRightName: "Me",
  conversationFolder: "Solomon Conversations",
  useThemeColors: true,
  leftBubbleColor: "#e9e9eb",
  rightBubbleColor: "#8b6cef",
  leftTextColor: "#1c1c1e",
  rightTextColor: "#ffffff",
  showTimestamps: true,
  autoFocusComposer: true,
  showPerspectivePrompts: true
};
var PERSPECTIVE_PROMPTS = [
  "If a close friend brought me this problem, what would I tell them?",
  "What might I be missing or unable to know yet?",
  "How could each person involved see this differently?",
  "What compromise or middle path might be possible?",
  "What is likely to change with time?",
  "Looking back a year from now, what choice would feel wise?"
];

// src/modals.ts
var import_obsidian = require("obsidian");
var FormModal = class extends import_obsidian.Modal {
  constructor(app, options) {
    super(app);
    this.options = options;
  }
  onOpen() {
    this.setTitle(this.options.title);
    this.contentEl.empty();
    const values = { ...this.options.initial };
    let firstInput = null;
    for (const field of this.options.fields) {
      const setting = new import_obsidian.Setting(this.contentEl).setName(field.name).setDesc(field.description || "");
      if (field.type === "textarea") {
        setting.addTextArea((component) => {
          component.setValue(values[field.key] || "").setPlaceholder(field.placeholder || "").onChange((value) => values[field.key] = value);
          component.inputEl.rows = 4;
          firstInput || (firstInput = component.inputEl);
        });
      } else {
        setting.addText((component) => {
          component.setValue(values[field.key] || "").setPlaceholder(field.placeholder || "").onChange((value) => values[field.key] = value);
          firstInput || (firstInput = component.inputEl);
        });
      }
    }
    const buttons = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = buttons.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const submit = buttons.createEl("button", { text: this.options.submitLabel || "Save", cls: "mod-cta" });
    submit.addEventListener("click", () => {
      void this.submit(values, submit);
    });
    window.setTimeout(() => firstInput == null ? void 0 : firstInput.focus(), 0);
  }
  async submit(values, submit) {
    submit.disabled = true;
    try {
      if (await this.options.onSubmit(values) !== false) this.close();
    } finally {
      submit.disabled = false;
    }
  }
};

// src/model.ts
function extractFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return { frontmatter: {}, body: normalized };
  const lines = normalized.split("\n");
  const relativeEnd = lines.slice(1).findIndex((line) => line.trim() === "---");
  if (relativeEnd < 0) return { frontmatter: {}, body: normalized };
  const end = relativeEnd + 1;
  const frontmatter = {};
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const raw = match[2].trim();
    if (/^(true|false)$/i.test(raw)) frontmatter[match[1]] = raw.toLowerCase() === "true";
    else frontmatter[match[1]] = unquoteYaml(raw);
  }
  return { frontmatter, body: lines.slice(end + 1).join("\n") };
}
function parseConversation(content, cachedFrontmatter, defaults) {
  const { frontmatter, body } = extractFrontmatter(content);
  const meta = { ...frontmatter, ...cachedFrontmatter };
  const hasMarkers = /^\[(left|right)(?:\s*,\s*.+?)?\]\s*$/im.test(body);
  const isConversation = readBoolean(meta[FM.flag]) || hasMarkers && Object.values(FM).some((key) => meta[key] != null);
  const empty = {
    isConversation,
    leftName: clean(meta[FM.leftName]) || defaults.leftName,
    rightName: clean(meta[FM.rightName]) || defaults.rightName,
    nextSide: meta[FM.nextSide] === "left" ? "left" : "right",
    attachmentFolder: clean(meta[FM.attachmentFolder]) || defaults.attachmentFolder,
    leftBio: clean(meta[FM.leftBio]),
    rightBio: clean(meta[FM.rightBio]),
    leftAvatar: clean(meta[FM.leftAvatar]),
    rightAvatar: clean(meta[FM.rightAvatar]),
    preamble: "",
    messages: []
  };
  if (!isConversation) return empty;
  const preamble = [];
  let current = null;
  const push = () => {
    if (!current) return;
    empty.messages.push({ side: current.side, timestamp: current.timestamp, content: trimBlankLines(current.lines.join("\n")) });
    current = null;
  };
  for (const line of body.split("\n")) {
    const match = line.match(/^\[(left|right)(?:\s*,\s*(.+?))?\]\s*$/i);
    if (match) {
      push();
      current = { side: match[1].toLowerCase(), timestamp: (match[2] || "").trim(), lines: [] };
    } else if (current) current.lines.push(line);
    else preamble.push(line);
  }
  push();
  empty.preamble = trimBlankLines(preamble.join("\n"));
  return empty;
}
function appendMessage(content, side, timestamp, message) {
  const normalized = content.replace(/\r\n/g, "\n").trimEnd();
  const block = `[${side}, ${timestamp}]
${trimBlankLines(message)}
`;
  return normalized ? `${normalized}

${block}` : block;
}
function replaceMessage(content, messageIndex, replacement) {
  var _a, _b;
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const markers = [];
  lines.forEach((line, index) => {
    if (/^\[(left|right)(?:\s*,\s*.+?)?\]\s*$/i.test(line)) markers.push(index);
  });
  const start = markers[messageIndex];
  if (start == null) return content;
  const end = (_a = markers[messageIndex + 1]) != null ? _a : lines.length;
  if (replacement == null) {
    let removeStart = start;
    while (removeStart > 0 && lines[removeStart - 1].trim() === "" && ((_b = lines[removeStart - 2]) == null ? void 0 : _b.trim()) !== "---") removeStart--;
    lines.splice(removeStart, end - removeStart);
  } else {
    const replacementLines = trimBlankLines(replacement).split("\n");
    lines.splice(start + 1, end - start - 1, ...replacementLines, "");
  }
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}
`;
}
function currentTimestamp(date = /* @__PURE__ */ new Date()) {
  const two = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}
function trimBlankLines(value) {
  return value.replace(/\r\n/g, "\n").replace(/^\s*\n/, "").replace(/\n\s*$/, "");
}
function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}
function readBoolean(value) {
  return value === true || String(value).toLowerCase() === "true";
}
function unquoteYaml(value) {
  if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  return value;
}

// src/settings.ts
var import_obsidian2 = require("obsidian");
var SolomonSettingsTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, owner) {
    super(app, owner);
    this.owner = owner;
  }
  display() {
    this.renderSettings();
  }
  renderSettings() {
    this.containerEl.empty();
    new import_obsidian2.Setting(this.containerEl).setName("Default wise-side name").setDesc("Used for the left side of new conversations.").addText((text) => text.setValue(this.owner.settings.defaultLeftName).onChange(async (value) => {
      this.owner.settings.defaultLeftName = value.trim() || "Wise Friend";
      await this.owner.saveSettings();
    }));
    new import_obsidian2.Setting(this.containerEl).setName("Default self-side name").setDesc("Used for the right side of new conversations.").addText((text) => text.setValue(this.owner.settings.defaultRightName).onChange(async (value) => {
      this.owner.settings.defaultRightName = value.trim() || "Me";
      await this.owner.saveSettings();
    }));
    new import_obsidian2.Setting(this.containerEl).setName("Conversation folder").setDesc("New Markdown conversations are created here.").addText((text) => text.setValue(this.owner.settings.conversationFolder).onChange(async (value) => {
      this.owner.settings.conversationFolder = value.trim();
      await this.owner.saveSettings();
    }));
    new import_obsidian2.Setting(this.containerEl).setName("Show timestamps").setDesc("Show the speaker and time above each bubble.").addToggle((toggle) => toggle.setValue(this.owner.settings.showTimestamps).onChange(async (value) => {
      this.owner.settings.showTimestamps = value;
      await this.owner.saveSettings();
      this.owner.refreshAllLeaves();
    }));
    new import_obsidian2.Setting(this.containerEl).setName("Perspective prompts").setDesc("Show optional self-distancing prompts in the chat header.").addToggle((toggle) => toggle.setValue(this.owner.settings.showPerspectivePrompts).onChange(async (value) => {
      this.owner.settings.showPerspectivePrompts = value;
      await this.owner.saveSettings();
      this.owner.refreshAllLeaves();
    }));
    new import_obsidian2.Setting(this.containerEl).setName("Auto-focus composer").setDesc("Focus the message box when a conversation opens.").addToggle((toggle) => toggle.setValue(this.owner.settings.autoFocusComposer).onChange(async (value) => {
      this.owner.settings.autoFocusComposer = value;
      await this.owner.saveSettings();
    }));
    new import_obsidian2.Setting(this.containerEl).setName("Use theme colors").setDesc("Adapt bubble colors to the active Obsidian theme.").addToggle((toggle) => toggle.setValue(this.owner.settings.useThemeColors).onChange(async (value) => {
      this.owner.settings.useThemeColors = value;
      await this.owner.saveSettings();
      this.owner.refreshAllLeaves();
      this.renderSettings();
    }));
    if (!this.owner.settings.useThemeColors) this.addColorSettings();
  }
  addColorSettings() {
    const color = (name, key) => {
      new import_obsidian2.Setting(this.containerEl).setName(name).addColorPicker((picker) => picker.setValue(this.owner.settings[key]).onChange(async (value) => {
        this.owner.settings[key] = value;
        await this.owner.saveSettings();
        this.owner.refreshAllLeaves();
      }));
    };
    color("Left bubble", "leftBubbleColor");
    color("Left text", "leftTextColor");
    color("Right bubble", "rightBubbleColor");
    color("Right text", "rightTextColor");
  }
};

// src/viewport.ts
function calculateViewportLayout(input) {
  if (!input.mobile) return { keyboardOpen: false, composeMode: false, bottomClearance: 0 };
  const keyboardDelta = Math.max(0, input.layoutHeight - input.visualHeight - input.visualOffsetTop);
  const keyboardOpen = input.focused && keyboardDelta > 100;
  const visibleBottom = input.visualOffsetTop + input.visualHeight;
  const keyboardClearance = Math.max(0, input.containerBottom - visibleBottom);
  return {
    keyboardOpen,
    composeMode: input.focused,
    bottomClearance: keyboardOpen ? Math.round(keyboardClearance) : Math.max(0, input.closedToolbarClearance)
  };
}

// src/plugin.ts
var SolomonChatPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "settings", { ...DEFAULT_SETTINGS });
    __publicField(this, "states", /* @__PURE__ */ new Map());
    __publicField(this, "rawLeaves", /* @__PURE__ */ new WeakMap());
    __publicField(this, "fileQueues", /* @__PURE__ */ new Map());
    __publicField(this, "refreshTokens", /* @__PURE__ */ new WeakMap());
    __publicField(this, "viewportFrame", 0);
    __publicField(this, "viewportTimer", 0);
  }
  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...await this.loadData() };
    this.addRibbonIcon("messages-square", "Create a conversation", () => this.openCreateModal());
    this.addCommand({ id: "create-conversation", name: "Create new conversation", callback: () => this.openCreateModal() });
    this.addCommand({ id: "edit-participants", name: "Edit conversation participants", checkCallback: (checking) => this.withActiveConversation(checking, (file) => this.openParticipantsModal(file)) });
    this.addCommand({ id: "switch-speaker", name: "Switch active speaker", checkCallback: (checking) => this.withActiveConversation(checking, (file) => void this.switchSpeaker(file)) });
    this.addCommand({ id: "toggle-raw-markdown", name: "Toggle chat and raw Markdown", checkCallback: (checking) => this.withActiveConversation(checking, () => {
      const view = this.app.workspace.getActiveViewOfType(import_obsidian3.MarkdownView);
      if (view) this.toggleRaw(view.leaf);
    }) });
    this.addCommand({ id: "export-transcript", name: "Export readable transcript", checkCallback: (checking) => this.withActiveConversation(checking, (file) => void this.exportTranscript(file)) });
    this.addSettingTab(new SolomonSettingsTab(this.app, this));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.scheduleAll()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.scheduleAll()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleAll()));
    this.registerEvent(this.app.vault.on("modify", (file) => file instanceof import_obsidian3.TFile && this.scheduleFile(file)));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => this.scheduleFile(file)));
    this.registerDomEvent(window, "resize", () => this.scheduleViewport());
    if (window.visualViewport) {
      const update = () => this.scheduleViewport();
      window.visualViewport.addEventListener("resize", update);
      window.visualViewport.addEventListener("scroll", update);
      this.register(() => {
        var _a, _b;
        (_a = window.visualViewport) == null ? void 0 : _a.removeEventListener("resize", update);
        (_b = window.visualViewport) == null ? void 0 : _b.removeEventListener("scroll", update);
      });
    }
    this.app.workspace.onLayoutReady(() => this.scheduleAll());
  }
  onunload() {
    if (this.viewportFrame) window.cancelAnimationFrame(this.viewportFrame);
    if (this.viewportTimer) window.clearTimeout(this.viewportTimer);
    for (const leaf of [...this.states.keys()]) this.teardown(leaf);
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  refreshAllLeaves() {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) void this.refreshLeaf(leaf);
  }
  scheduleAll() {
    this.refreshAllLeaves();
    window.setTimeout(() => this.refreshAllLeaves(), 100);
    this.scheduleViewport();
  }
  scheduleFile(file) {
    var _a;
    if (file.extension !== "md") return;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof import_obsidian3.MarkdownView && ((_a = leaf.view.file) == null ? void 0 : _a.path) === file.path) void this.refreshLeaf(leaf);
    }
  }
  async refreshLeaf(leaf) {
    var _a;
    if (!(leaf.view instanceof import_obsidian3.MarkdownView)) return;
    const file = leaf.view.file;
    if (!(file instanceof import_obsidian3.TFile) || file.extension !== "md") return this.teardown(leaf);
    if (this.rawLeaves.get(leaf) === file.path) return this.teardown(leaf);
    const token = (this.refreshTokens.get(leaf) || 0) + 1;
    this.refreshTokens.set(leaf, token);
    const content = await this.app.vault.cachedRead(file);
    if (this.refreshTokens.get(leaf) !== token || ((_a = leaf.view.file) == null ? void 0 : _a.path) !== file.path) return;
    const conversation = parseConversation(content, this.frontmatterFor(file), {
      leftName: this.settings.defaultLeftName,
      rightName: this.settings.defaultRightName,
      attachmentFolder: this.defaultAttachmentFolder(file)
    });
    if (!conversation.isConversation) return this.teardown(leaf);
    this.render(leaf, file, conversation);
  }
  createState(leaf, file, conversation) {
    if (!(leaf.view instanceof import_obsidian3.MarkdownView)) throw new Error("Solomon Chat requires a Markdown view");
    const host = leaf.view.containerEl.querySelector(".view-content") || leaf.view.contentEl;
    const root = host.createDiv({ cls: "solomon-chat-root" });
    const header = root.createDiv({ cls: "solomon-chat-header" });
    const messages = root.createDiv({ cls: "solomon-chat-messages", attr: { role: "log", "aria-live": "polite", "aria-relevant": "additions" } });
    const composer = root.createDiv({ cls: "solomon-chat-composer" });
    const sender = composer.createEl("button", { cls: "solomon-chat-sender" });
    sender.type = "button";
    const textarea = composer.createEl("textarea", { attr: { rows: "1", enterkeyhint: "send", autocapitalize: "sentences", placeholder: "Write a message\u2026" } });
    const attach = composer.createEl("button", { cls: "solomon-chat-icon", attr: { "aria-label": "Attach files" } });
    attach.type = "button";
    (0, import_obsidian3.setIcon)(attach, "paperclip");
    const send = composer.createEl("button", { cls: "solomon-chat-send", attr: { "aria-label": "Send message" } });
    send.type = "button";
    (0, import_obsidian3.setIcon)(send, "arrow-up");
    const component = new import_obsidian3.Component();
    component.load();
    const state = { leaf, file, root, header, messages, composer, textarea, sender, attach, send, draft: "", conversation, component, focused: false, sending: false, blurTimer: 0, lastMessageCount: 0 };
    textarea.addEventListener("input", () => {
      state.draft = textarea.value;
      this.resizeTextarea(textarea);
      send.disabled = state.sending || !textarea.value.trim();
    });
    textarea.addEventListener("focus", () => {
      state.focused = true;
      this.applyViewport(state);
    });
    textarea.addEventListener("blur", () => {
      window.clearTimeout(state.blurTimer);
      state.blurTimer = window.setTimeout(() => {
        state.focused = state.textarea === document.activeElement;
        this.applyViewport(state);
      }, 140);
    });
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        void this.submit(state);
      }
    });
    send.addEventListener("pointerdown", (event) => event.preventDefault());
    send.addEventListener("click", () => void this.submit(state));
    sender.addEventListener("pointerdown", (event) => event.preventDefault());
    sender.addEventListener("click", () => void this.switchSpeaker(state.file));
    attach.addEventListener("pointerdown", (event) => event.preventDefault());
    attach.addEventListener("click", () => void this.attachFiles(state));
    return state;
  }
  render(leaf, file, conversation) {
    let state = this.states.get(leaf);
    const firstRender = !state;
    const oldPath = state == null ? void 0 : state.file.path;
    const preserveFocus = (state == null ? void 0 : state.textarea) === document.activeElement;
    const oldCount = (state == null ? void 0 : state.lastMessageCount) || 0;
    if (!state) {
      state = this.createState(leaf, file, conversation);
      this.states.set(leaf, state);
    }
    if (oldPath && oldPath !== file.path) state.draft = "";
    state.file = file;
    state.conversation = conversation;
    state.component.unload();
    state.component = new import_obsidian3.Component();
    state.component.load();
    leaf.view.containerEl.addClass("solomon-chat-active");
    this.applyColors(state.root);
    this.renderHeader(state);
    state.messages.empty();
    if (conversation.preamble) {
      const preamble = state.messages.createDiv({ cls: "solomon-chat-preamble" });
      void import_obsidian3.MarkdownRenderer.render(this.app, conversation.preamble, preamble, file.path, state.component);
    }
    if (!conversation.messages.length) this.renderEmptyState(state);
    for (let index = 0; index < conversation.messages.length; index++) {
      const animate = !firstRender && conversation.messages.length > oldCount && index >= oldCount;
      this.renderMessage(state, index, animate);
    }
    state.lastMessageCount = conversation.messages.length;
    state.textarea.value = state.draft;
    state.send.disabled = state.sending || !state.draft.trim();
    this.resizeTextarea(state.textarea);
    this.applyViewport(state);
    const renderedState = state;
    window.setTimeout(() => {
      if (firstRender || conversation.messages.length > oldCount) renderedState.messages.scrollTop = renderedState.messages.scrollHeight;
      if (this.settings.autoFocusComposer && (firstRender && !import_obsidian3.Platform.isMobile || preserveFocus)) this.focusTextarea(renderedState.textarea);
    }, 0);
  }
  renderHeader(state) {
    state.header.empty();
    const people = state.header.createDiv({ cls: "solomon-chat-people" });
    this.renderPerson(people, state, "left");
    people.createSpan({ cls: "solomon-chat-title", text: state.file.basename });
    this.renderPerson(people, state, "right");
    const actions = state.header.createDiv({ cls: "solomon-chat-actions" });
    if (this.settings.showPerspectivePrompts) this.iconButton(actions, "sparkles", "Perspective prompts", () => this.openPromptMenu(state));
    this.iconButton(actions, "users", "Edit participants", () => this.openParticipantsModal(state.file));
    this.iconButton(actions, "file-pen-line", "Edit raw Markdown", () => this.toggleRaw(state.leaf));
    this.iconButton(actions, "download", "Export transcript", () => void this.exportTranscript(state.file));
    state.sender.textContent = state.conversation.nextSide === "left" ? state.conversation.leftName : state.conversation.rightName;
    state.sender.setAttribute("aria-label", `Sending as ${state.sender.textContent}. Tap to switch.`);
    state.textarea.placeholder = `Message as ${state.sender.textContent}`;
  }
  renderPerson(parent, state, side) {
    const name = side === "left" ? state.conversation.leftName : state.conversation.rightName;
    const bio = side === "left" ? state.conversation.leftBio : state.conversation.rightBio;
    const avatar = side === "left" ? state.conversation.leftAvatar : state.conversation.rightAvatar;
    const button = parent.createEl("button", { cls: `solomon-chat-person is-${side}`, attr: { "aria-label": bio ? `${name}: ${bio}` : name } });
    const avatarFile = avatar ? this.app.vault.getAbstractFileByPath(avatar) : null;
    if (avatarFile instanceof import_obsidian3.TFile) {
      const resource = this.app.vault.getResourcePath(avatarFile);
      button.createEl("img", { attr: { src: resource, alt: "" } });
    } else button.createSpan({ cls: "solomon-chat-initial", text: name.slice(0, 1).toUpperCase() });
    button.createSpan({ text: name });
    button.addEventListener("click", () => this.openParticipantsModal(state.file));
  }
  renderEmptyState(state) {
    const empty = state.messages.createDiv({ cls: "solomon-chat-empty" });
    empty.createEl("h3", { text: "Start with what\u2019s on your mind" });
    empty.createEl("p", { text: "Then switch sides and answer as if you were advising someone you care about." });
    const prompt = empty.createEl("button", { text: "Use a perspective prompt" });
    prompt.addEventListener("click", () => this.openPromptMenu(state));
  }
  renderMessage(state, index, animate = false) {
    const message = state.conversation.messages[index];
    const wrapper = state.messages.createDiv({ cls: `solomon-chat-message is-${message.side}${animate ? " is-entering" : ""}` });
    const name = message.side === "left" ? state.conversation.leftName : state.conversation.rightName;
    if (this.settings.showTimestamps) wrapper.createDiv({ cls: "solomon-chat-meta", text: message.timestamp ? `${name} \xB7 ${this.formatTimestamp(message.timestamp)}` : name });
    const bubble = wrapper.createDiv({ cls: "solomon-chat-bubble", attr: { tabindex: "0" } });
    void import_obsidian3.MarkdownRenderer.render(this.app, message.content || " ", bubble, state.file.path, state.component).then(() => this.wireLinks(bubble, state.file.path));
    const showMenu = (event) => {
      event.preventDefault();
      const menu = new import_obsidian3.Menu();
      menu.addItem((item) => item.setTitle("Edit message").setIcon("pencil").onClick(() => this.openEditModal(state.file, index, message.content)));
      menu.addItem((item) => item.setTitle("Delete message").setIcon("trash-2").onClick(() => void this.deleteMessage(state.file, index)));
      menu.showAtMouseEvent(event);
    };
    bubble.addEventListener("contextmenu", showMenu);
    let timer = 0;
    let startX = 0;
    let startY = 0;
    bubble.addEventListener("touchstart", (event) => {
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      timer = window.setTimeout(() => showMenu(new MouseEvent("contextmenu", { clientX: startX, clientY: startY })), 550);
    }, { passive: true });
    const cancel = () => {
      if (timer) window.clearTimeout(timer);
      timer = 0;
    };
    bubble.addEventListener("touchend", cancel);
    bubble.addEventListener("touchcancel", cancel);
    bubble.addEventListener("touchmove", (event) => {
      const touch = event.touches[0];
      if (Math.abs(touch.clientX - startX) > 8 || Math.abs(touch.clientY - startY) > 8) cancel();
    }, { passive: true });
  }
  async submit(state) {
    const draft = state.textarea.value;
    if (!draft.trim() || state.sending) return;
    const side = state.conversation.nextSide;
    state.sending = true;
    state.send.disabled = true;
    state.attach.disabled = true;
    try {
      await this.queue(state.file.path, async () => {
        await this.app.fileManager.processFrontMatter(state.file, (fm) => this.ensureFrontmatter(fm, state.file, side === "left" ? "right" : "left"));
        await this.app.vault.process(state.file, (content) => appendMessage(content, side, currentTimestamp(), draft));
      });
      state.draft = "";
      state.textarea.value = "";
      state.conversation.nextSide = side === "left" ? "right" : "left";
      this.renderHeader(state);
      this.resizeTextarea(state.textarea);
      this.focusTextarea(state.textarea);
    } catch (error) {
      console.error("Solomon Chat: send failed", error);
      new import_obsidian3.Notice("Could not send that message. Your draft is still here.");
    } finally {
      state.sending = false;
      state.attach.disabled = false;
      state.send.disabled = !state.textarea.value.trim();
    }
  }
  async switchSpeaker(file) {
    var _a;
    const visibleStates = [...this.states.values()].filter((state) => state.file.path === file.path);
    const visibleSide = (_a = visibleStates[0]) == null ? void 0 : _a.conversation.nextSide;
    const cachedSide = this.frontmatterFor(file)[FM.nextSide];
    const target = (visibleSide || cachedSide) === "left" ? "right" : "left";
    for (const state of visibleStates) {
      state.conversation.nextSide = target;
      this.renderHeader(state);
    }
    await this.queue(file.path, async () => this.app.fileManager.processFrontMatter(file, (fm) => {
      this.ensureFrontmatter(fm, file, target);
    }));
    this.scheduleFile(file);
    window.setTimeout(() => {
      const state = [...this.states.values()].find((item) => item.file.path === file.path);
      if (state) this.focusTextarea(state.textarea);
    }, 0);
  }
  openPromptMenu(state) {
    const menu = new import_obsidian3.Menu();
    for (const prompt of PERSPECTIVE_PROMPTS) menu.addItem((item) => item.setTitle(prompt).onClick(() => {
      state.textarea.value = state.textarea.value.trim() ? `${state.textarea.value.trimEnd()}

${prompt}` : prompt;
      state.draft = state.textarea.value;
      state.send.disabled = false;
      this.resizeTextarea(state.textarea);
      this.focusTextarea(state.textarea);
    }));
    const rect = state.header.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left + Math.min(rect.width / 2, 220), y: rect.bottom });
  }
  openCreateModal() {
    new FormModal(this.app, { title: "New Solomon conversation", submitLabel: "Create", initial: { title: "", left: this.settings.defaultLeftName, right: this.settings.defaultRightName }, fields: [
      { key: "title", name: "Conversation name", placeholder: "What I need perspective on" },
      { key: "left", name: "Wise side", description: "The character or perspective giving advice." },
      { key: "right", name: "Self side", description: "Usually you." }
    ], onSubmit: async (values) => {
      await this.createConversation(values.title, values.left, values.right);
    } }).open();
  }
  openParticipantsModal(file) {
    const fm = this.frontmatterFor(file);
    new FormModal(this.app, { title: "Conversation participants", initial: {
      left: this.frontmatterString(fm, FM.leftName) || this.settings.defaultLeftName,
      right: this.frontmatterString(fm, FM.rightName) || this.settings.defaultRightName,
      leftBio: this.frontmatterString(fm, FM.leftBio),
      rightBio: this.frontmatterString(fm, FM.rightBio),
      leftAvatar: this.frontmatterString(fm, FM.leftAvatar),
      rightAvatar: this.frontmatterString(fm, FM.rightAvatar)
    }, fields: [
      { key: "left", name: "Left-side name" },
      { key: "leftBio", name: "Left-side bio", type: "textarea", description: "Who are they, and what perspective should they represent?" },
      { key: "leftAvatar", name: "Left avatar path", description: "Optional vault-relative image path." },
      { key: "right", name: "Right-side name" },
      { key: "rightBio", name: "Right-side bio", type: "textarea" },
      { key: "rightAvatar", name: "Right avatar path", description: "Optional vault-relative image path." }
    ], onSubmit: async (values) => {
      await this.queue(file.path, async () => this.app.fileManager.processFrontMatter(file, (edit) => {
        this.ensureFrontmatter(edit, file, edit[FM.nextSide] === "left" ? "left" : "right");
        edit[FM.leftName] = values.left.trim() || this.settings.defaultLeftName;
        edit[FM.rightName] = values.right.trim() || this.settings.defaultRightName;
        this.setOrDelete(edit, FM.leftBio, values.leftBio);
        this.setOrDelete(edit, FM.rightBio, values.rightBio);
        this.setOrDelete(edit, FM.leftAvatar, values.leftAvatar);
        this.setOrDelete(edit, FM.rightAvatar, values.rightAvatar);
      }));
    } }).open();
  }
  openEditModal(file, index, content) {
    new FormModal(this.app, { title: "Edit message", initial: { content }, fields: [{ key: "content", name: "Message", type: "textarea" }], onSubmit: async (values) => {
      if (!values.content.trim()) {
        new import_obsidian3.Notice("A message cannot be empty. Delete it instead.");
        return false;
      }
      await this.queue(file.path, async () => this.app.vault.process(file, (existing) => replaceMessage(existing, index, values.content)));
    } }).open();
  }
  async deleteMessage(file, index) {
    await this.queue(file.path, async () => this.app.vault.process(file, (existing) => replaceMessage(existing, index, null)));
    new import_obsidian3.Notice("Message deleted");
  }
  async createConversation(title, left, right) {
    const folder = (0, import_obsidian3.normalizePath)(this.settings.conversationFolder || "");
    await this.ensureFolder(folder);
    const base = this.safeName(title || "New Conversation");
    const path = await this.availablePath(folder, base, ".md");
    const attachmentFolder = (0, import_obsidian3.normalizePath)(`${this.parentPath(path) ? `${this.parentPath(path)}/` : ""}${this.basename(path)}.attachments`);
    const yaml = ["---", `${FM.flag}: true`, `${FM.leftName}: ${this.yaml(left.trim() || this.settings.defaultLeftName)}`, `${FM.rightName}: ${this.yaml(right.trim() || this.settings.defaultRightName)}`, `${FM.nextSide}: right`, `${FM.attachmentFolder}: ${this.yaml(attachmentFolder)}`, "---", ""].join("\n");
    const file = await this.app.vault.create(path, yaml);
    await this.app.workspace.getLeaf(false).openFile(file);
  }
  async attachFiles(state) {
    const input = document.body.createEl("input", { attr: { type: "file", multiple: "", hidden: "" } });
    const selected = await new Promise((resolve) => {
      input.addEventListener("change", () => resolve(Array.from(input.files || [])), { once: true });
      input.click();
    });
    input.remove();
    if (!selected.length) return;
    state.attach.disabled = true;
    try {
      const folder = await this.ensureAttachmentFolder(state.file);
      const links = [];
      for (const file of selected) {
        const target = await this.availablePath(folder, this.safeName(file.name, true), "");
        await this.app.vault.createBinary(target, await file.arrayBuffer());
        const relative = this.relativePath(this.parentPath(state.file.path), target);
        const escaped = encodeURI(relative).replace(/#/g, "%23");
        links.push(file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|heic)$/i.test(file.name) ? `![${file.name}](${escaped})` : `[${file.name}](${escaped})`);
      }
      const insertion = links.join("\n");
      state.textarea.value = state.textarea.value.trim() ? `${state.textarea.value.trimEnd()}

${insertion}` : insertion;
      state.draft = state.textarea.value;
      state.send.disabled = false;
      this.resizeTextarea(state.textarea);
      this.focusTextarea(state.textarea);
    } catch (error) {
      console.error("Solomon Chat: attachment failed", error);
      new import_obsidian3.Notice("Could not import attachment.");
    } finally {
      state.attach.disabled = false;
    }
  }
  async ensureAttachmentFolder(file) {
    let folder = this.defaultAttachmentFolder(file);
    await this.queue(file.path, async () => this.app.fileManager.processFrontMatter(file, (fm) => {
      folder = this.frontmatterString(fm, FM.attachmentFolder) || folder;
      this.ensureFrontmatter(fm, file, fm[FM.nextSide] === "left" ? "left" : "right");
      fm[FM.attachmentFolder] = folder;
    }));
    await this.ensureFolder(folder);
    return folder;
  }
  toggleRaw(leaf) {
    const file = leaf.view instanceof import_obsidian3.MarkdownView ? leaf.view.file : null;
    if (!(file instanceof import_obsidian3.TFile)) return;
    if (this.rawLeaves.get(leaf) === file.path) this.rawLeaves.delete(leaf);
    else this.rawLeaves.set(leaf, file.path);
    void this.refreshLeaf(leaf);
  }
  async exportTranscript(file) {
    const content = await this.app.vault.read(file);
    const conversation = parseConversation(content, this.frontmatterFor(file), { leftName: this.settings.defaultLeftName, rightName: this.settings.defaultRightName, attachmentFolder: this.defaultAttachmentFolder(file) });
    const text = conversation.messages.map((message) => `${message.side === "left" ? conversation.leftName : conversation.rightName}${message.timestamp ? ` - ${message.timestamp}` : ""}
${message.content}`).join("\n\n");
    const path = await this.availablePath(this.parentPath(file.path), `${file.basename} - Transcript`, ".txt");
    await this.app.vault.create(path, `${text}
`);
    new import_obsidian3.Notice(`Transcript saved to ${path}`);
  }
  teardown(leaf) {
    const state = this.states.get(leaf);
    if (!state) return;
    window.clearTimeout(state.blurTimer);
    state.component.unload();
    state.root.remove();
    leaf.view.containerEl.removeClass("solomon-chat-active");
    this.states.delete(leaf);
  }
  scheduleViewport() {
    if (!this.viewportFrame) this.viewportFrame = window.requestAnimationFrame(() => {
      this.viewportFrame = 0;
      for (const state of this.states.values()) this.applyViewport(state);
    });
    window.clearTimeout(this.viewportTimer);
    this.viewportTimer = window.setTimeout(() => {
      this.viewportTimer = 0;
      for (const state of this.states.values()) this.applyViewport(state);
    }, 160);
  }
  applyViewport(state) {
    if (!state.root.isConnected) return;
    const vv = window.visualViewport;
    const rect = state.root.getBoundingClientRect();
    const focused = state.focused || state.composer.contains(document.activeElement);
    const closedToolbarClearance = import_obsidian3.Platform.isMobile ? this.measureBottomToolbar(state.root) : 0;
    const layout = calculateViewportLayout({ mobile: import_obsidian3.Platform.isMobile, focused, layoutHeight: window.innerHeight, visualHeight: (vv == null ? void 0 : vv.height) || window.innerHeight, visualOffsetTop: (vv == null ? void 0 : vv.offsetTop) || 0, containerBottom: rect.bottom, closedToolbarClearance });
    state.root.classList.toggle("is-compose-mode", layout.composeMode);
    state.root.classList.toggle("is-keyboard-open", layout.keyboardOpen);
    state.root.style.setProperty("--solomon-bottom-clearance", `${Math.min(layout.bottomClearance, Math.max(0, rect.height * 0.5))}px`);
  }
  measureBottomToolbar(root) {
    const rect = root.getBoundingClientRect();
    let top = rect.bottom;
    for (const element of document.elementsFromPoint(Math.max(8, rect.left + rect.width / 2), Math.max(8, window.innerHeight - 12))) {
      if (!element.instanceOf(HTMLElement) || root.contains(element) || element.contains(root)) continue;
      const style = getComputedStyle(element);
      if (style.position !== "fixed" && style.position !== "sticky") continue;
      const candidate = element.getBoundingClientRect();
      if (candidate.bottom >= window.innerHeight - 4) top = Math.min(top, candidate.top);
    }
    return Math.max(0, Math.round(rect.bottom - top + (top < rect.bottom ? 6 : 0)));
  }
  applyColors(root) {
    const keys = ["--solomon-left-bubble", "--solomon-right-bubble", "--solomon-left-text", "--solomon-right-text"];
    if (this.settings.useThemeColors) keys.forEach((key) => root.style.removeProperty(key));
    else {
      root.style.setProperty(keys[0], this.settings.leftBubbleColor);
      root.style.setProperty(keys[1], this.settings.rightBubbleColor);
      root.style.setProperty(keys[2], this.settings.leftTextColor);
      root.style.setProperty(keys[3], this.settings.rightTextColor);
    }
  }
  wireLinks(container, source) {
    container.querySelectorAll("a.internal-link").forEach((link) => link.addEventListener("click", (event) => {
      event.preventDefault();
      void this.app.workspace.openLinkText(link.dataset.href || link.getAttribute("href") || "", source, event.ctrlKey || event.metaKey);
    }));
  }
  iconButton(parent, icon, label, action) {
    const button = parent.createEl("button", { cls: "solomon-chat-icon", attr: { "aria-label": label, "data-tooltip-position": "bottom" } });
    (0, import_obsidian3.setIcon)(button, icon);
    button.addEventListener("click", action);
  }
  withActiveConversation(checking, action) {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian3.MarkdownView);
    const file = view == null ? void 0 : view.file;
    if (!(file instanceof import_obsidian3.TFile)) return false;
    const fm = this.frontmatterFor(file);
    if (!fm[FM.flag]) return false;
    if (!checking) action(file);
    return true;
  }
  ensureFrontmatter(fm, file, side) {
    fm[FM.flag] = true;
    if (!this.frontmatterString(fm, FM.leftName)) fm[FM.leftName] = this.settings.defaultLeftName;
    if (!this.frontmatterString(fm, FM.rightName)) fm[FM.rightName] = this.settings.defaultRightName;
    fm[FM.nextSide] = side;
    if (!this.frontmatterString(fm, FM.attachmentFolder)) fm[FM.attachmentFolder] = this.defaultAttachmentFolder(file);
  }
  setOrDelete(fm, key, value) {
    if (value.trim()) fm[key] = value.trim();
    else delete fm[key];
  }
  resizeTextarea(textarea) {
    textarea.setCssProps({ height: "auto" });
    textarea.setCssProps({ height: `${Math.min(textarea.scrollHeight, 144)}px` });
  }
  focusTextarea(textarea) {
    textarea.focus({ preventScroll: true });
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  }
  formatTimestamp(value) {
    const date = new Date(value.replace(" ", "T"));
    return Number.isNaN(date.valueOf()) ? value : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  queue(key, task) {
    const previous = this.fileQueues.get(key) || Promise.resolve();
    const next = previous.catch(() => void 0).then(task);
    this.fileQueues.set(key, next);
    const cleanup = () => {
      if (this.fileQueues.get(key) === next) this.fileQueues.delete(key);
    };
    void next.then(cleanup, cleanup);
    return next;
  }
  defaultAttachmentFolder(file) {
    const parent = this.parentPath(file.path);
    return (0, import_obsidian3.normalizePath)(`${parent ? `${parent}/` : ""}${file.basename}.attachments`);
  }
  parentPath(path) {
    const normalized = (0, import_obsidian3.normalizePath)(path);
    const index = normalized.lastIndexOf("/");
    return index < 0 ? "" : normalized.slice(0, index);
  }
  basename(path) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    return name.replace(/\.md$/i, "");
  }
  safeName(value, keepExtension = false) {
    const cleaned = value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() || "Untitled";
    return keepExtension ? cleaned : cleaned.replace(/\.[^.]+$/, "");
  }
  yaml(value) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  async ensureFolder(folder) {
    let path = "";
    for (const part of (0, import_obsidian3.normalizePath)(folder).split("/").filter(Boolean)) {
      path = path ? `${path}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(path)) await this.app.vault.createFolder(path);
    }
  }
  async availablePath(folder, name, extension) {
    var _a;
    let index = 1;
    let candidate = "";
    do {
      const suffix = index === 1 ? "" : ` ${index}`;
      candidate = (0, import_obsidian3.normalizePath)(`${folder ? `${folder}/` : ""}${extension ? name : name.replace(/\.[^.]+$/, "")}${suffix}${extension || (((_a = name.match(/\.[^.]+$/)) == null ? void 0 : _a[0]) || "")}`);
      index++;
    } while (this.app.vault.getAbstractFileByPath(candidate));
    return candidate;
  }
  relativePath(fromFolder, target) {
    const from = (0, import_obsidian3.normalizePath)(fromFolder).split("/").filter(Boolean);
    const to = (0, import_obsidian3.normalizePath)(target).split("/").filter(Boolean);
    let shared = 0;
    while (from[shared] === to[shared] && shared < from.length && shared < to.length) shared++;
    return [...from.slice(shared).map(() => ".."), ...to.slice(shared)].join("/");
  }
  frontmatterFor(file) {
    var _a;
    return Object.assign({}, (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter);
  }
  frontmatterString(fm, key) {
    const value = fm[key];
    return typeof value === "string" ? value.trim() : "";
  }
};

// main.ts
var main_default = SolomonChatPlugin;
