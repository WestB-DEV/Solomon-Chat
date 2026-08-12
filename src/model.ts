import type { Side } from "./constants";
import { FM } from "./constants";

export interface ChatMessage {
  /** Persisted for new messages; deterministic fingerprint for legacy messages. */
  id: string;
  side: Side;
  timestamp: string;
  content: string;
}

export interface Conversation {
  isConversation: boolean;
  conversationId: string;
  leftName: string;
  rightName: string;
  nextSide: Side;
  attachmentFolder: string;
  leftBio: string;
  rightBio: string;
  leftAvatar: string;
  rightAvatar: string;
  preamble: string;
  messages: ChatMessage[];
}

export interface ParseDefaults {
  leftName: string;
  rightName: string;
  attachmentFolder: string;
}

export function extractFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return { frontmatter: {}, body: normalized };
  const lines = normalized.split("\n");
  const relativeEnd = lines.slice(1).findIndex((line) => line.trim() === "---");
  if (relativeEnd < 0) return { frontmatter: {}, body: normalized };
  const end = relativeEnd + 1;
  const frontmatter: Record<string, unknown> = {};
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const raw = match[2].trim();
    if (/^(true|false)$/i.test(raw)) frontmatter[match[1]] = raw.toLowerCase() === "true";
    else frontmatter[match[1]] = unquoteYaml(raw);
  }
  return { frontmatter, body: lines.slice(end + 1).join("\n") };
}

export function parseConversation(
  content: string,
  cachedFrontmatter: Record<string, unknown>,
  defaults: ParseDefaults,
): Conversation {
  const { frontmatter, body } = extractFrontmatter(content);
  const meta = { ...frontmatter, ...cachedFrontmatter };
  const hasMarkers = MESSAGE_MARKER.test(body);
  const isConversation = readBoolean(meta[FM.flag]) || (hasMarkers && Object.values(FM).some((key) => meta[key] != null));
  const empty: Conversation = {
    isConversation,
    conversationId: clean(meta[FM.conversationId]) || clean(meta.conversation_id),
    leftName: clean(meta[FM.leftName]) || defaults.leftName,
    rightName: clean(meta[FM.rightName]) || defaults.rightName,
    nextSide: meta[FM.nextSide] === "left" ? "left" : "right",
    attachmentFolder: clean(meta[FM.attachmentFolder]) || defaults.attachmentFolder,
    leftBio: clean(meta[FM.leftBio]),
    rightBio: clean(meta[FM.rightBio]),
    leftAvatar: clean(meta[FM.leftAvatar]),
    rightAvatar: clean(meta[FM.rightAvatar]),
    preamble: "",
    messages: [],
  };
  if (!isConversation) return empty;

  const preamble: string[] = [];
  let current: { id: string; side: Side; timestamp: string; lines: string[]; ordinal: number } | null = null;
  const push = () => {
    if (!current) return;
    const messageContent = trimBlankLines(current.lines.join("\n"));
    empty.messages.push({ id: current.id || legacyMessageId(current.side, current.timestamp, messageContent, current.ordinal), side: current.side, timestamp: current.timestamp, content: messageContent });
    current = null;
  };
  for (const line of body.split("\n")) {
    const match = line.match(MESSAGE_MARKER_LINE);
    if (match) {
      push();
      current = { side: match[1].toLowerCase() as Side, timestamp: (match[2] || "").trim(), id: (match[3] || "").trim(), lines: [], ordinal: empty.messages.length };
    } else if (current) current.lines.push(line);
    else preamble.push(line);
  }
  push();
  empty.preamble = trimBlankLines(preamble.join("\n"));
  return empty;
}

export function appendMessage(content: string, side: Side, timestamp: string, message: string, messageId?: string): string {
  if (messageId && parseConversation(content, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" }).messages.some((item) => item.id === messageId)) return content;
  const normalized = content.replace(/\r\n/g, "\n").trimEnd();
  const block = `[${side}, ${timestamp}${messageId ? `, id=${messageId}` : ""}]\n${trimBlankLines(message)}\n`;
  return normalized ? `${normalized}\n\n${block}` : block;
}

export function replaceMessage(content: string, messageIndex: number, replacement: string | null): string {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const markers: number[] = [];
  lines.forEach((line, index) => {
    if (MESSAGE_MARKER_LINE.test(line)) markers.push(index);
  });
  const start = markers[messageIndex];
  if (start == null) return content;
  const end = markers[messageIndex + 1] ?? lines.length;
  if (replacement == null) {
    let removeStart = start;
    while (removeStart > 0 && lines[removeStart - 1].trim() === "" && lines[removeStart - 2]?.trim() !== "---") removeStart--;
    lines.splice(removeStart, end - removeStart);
  } else {
    const replacementLines = trimBlankLines(replacement).split("\n");
    lines.splice(start + 1, end - start - 1, ...replacementLines, "");
  }
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

/** Stable-ID mutation. Legacy IDs are resolved from the current content, never stale array indexes. */
export function replaceMessageById(content: string, messageId: string, replacement: string | null): string {
  const parsed = parseConversation(content, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" });
  const index = parsed.messages.findIndex((message) => message.id === messageId);
  return index < 0 ? content : replaceMessage(content, index, replacement);
}

/** Lazily persists deterministic IDs into legacy markers without changing message bodies. */
export function ensureMessageIds(content: string, namespace = "legacy"): string {
  const parsed = parseConversation(content, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" });
  let ordinal = 0;
  return content.replace(/^\[(left|right)(?:\s*,\s*([^,\]]*?))?(?:\s*,\s*id=([A-Za-z0-9._:-]+))?\]\s*$/gim, (marker, side: string, timestamp: string | undefined, id: string | undefined) => {
    const message = parsed.messages[ordinal++]; if (id || !message) return marker;
    return `[${side.toLowerCase()}, ${(timestamp || "").trim()}, id=${namespaceLegacyId(message.id, namespace)}]`;
  });
}

function namespaceLegacyId(messageId: string, namespace: string): string {
  let hash = 2166136261;
  for (const char of namespace) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${messageId}-${(hash >>> 0).toString(36)}`;
}

/** One-file, one-write send transform: append and speaker advancement cannot diverge. */
export function applySend(content: string, input: { id: string; side: Side; timestamp: string; message: string }): string {
  const parsed = parseConversation(content, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" });
  if (parsed.messages.some((message) => message.id === input.id)) return content;
  const appended = appendMessage(content, input.side, input.timestamp, input.message, input.id);
  return setFrontmatterValue(appended, FM.nextSide, input.side === "left" ? "right" : "left");
}

export function setFrontmatterValue(content: string, key: string, value: string): string {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return `---\n${key}: ${value}\n---\n\n${normalized}`;
  const lines = normalized.split("\n");
  const end = lines.slice(1).findIndex((line) => line.trim() === "---") + 1;
  if (end <= 0) return content;
  const index = lines.slice(1, end).findIndex((line) => line.startsWith(`${key}:`));
  if (index >= 0) lines[index + 1] = `${key}: ${value}`;
  else lines.splice(end, 0, `${key}: ${value}`);
  return lines.join("\n");
}

export function createStableId(prefix = "msg"): string {
  const random = typeof window !== "undefined" && window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function currentTimestamp(date = new Date()): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

export function trimBlankLines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/^\s*\n/, "").replace(/\n\s*$/, "");
}

function clean(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function readBoolean(value: unknown): boolean { return value === true || String(value).toLowerCase() === "true"; }
function unquoteYaml(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  return value;
}

const MESSAGE_MARKER_LINE = /^\[(left|right)(?:\s*,\s*([^,\]]*?))?(?:\s*,\s*id=([A-Za-z0-9._:-]+))?\]\s*$/i;
const MESSAGE_MARKER = /^\[(left|right)(?:\s*,\s*([^,\]]*?))?(?:\s*,\s*id=([A-Za-z0-9._:-]+))?\]\s*$/im;

function legacyMessageId(side: Side, timestamp: string, content: string, ordinal: number): string {
  const value = `${side}\u0000${timestamp}\u0000${content}\u0000${ordinal}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `legacy-${(hash >>> 0).toString(36)}`;
}
