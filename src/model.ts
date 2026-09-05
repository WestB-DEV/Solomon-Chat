import type { Side } from "./constants";
import { FM } from "./constants";
import { chatBackgroundColor, chatBackgroundImage } from "./background";

export interface ChatMessage {
  id: string;
  side: Side;
  timestamp: string;
  content: string;
}

export type MessageTarget = Pick<ChatMessage, "id" | "side" | "timestamp" | "content">;

export interface AppendMessageOptions {
  messageId: string;
  senderName: string;
}

export interface AppendTransactionOptions extends AppendMessageOptions {
  attachmentFolder: string;
  conversationId: string;
  leftName: string;
  nextSide: Side;
  rightName: string;
  side: Side;
  timestamp: string;
  message: string;
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
  backgroundColor: string;
  backgroundImage: string;
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
  // The file is the durable source of truth; cached metadata can briefly lag a just-completed write.
  const meta = { ...cachedFrontmatter, ...frontmatter };
  const bodyLines = body.split("\n");
  const markerIndexes = new Set(messageMarkerIndexes(bodyLines));
  const hasMarkers = markerIndexes.size > 0;
  const isConversation = readBoolean(meta[FM.flag]) || (hasMarkers && Object.values(FM).some((key) => meta[key] != null));
  const empty: Conversation = {
    isConversation,
    conversationId: clean(meta[FM.conversationId]),
    leftName: clean(meta[FM.leftName]) || defaults.leftName,
    rightName: clean(meta[FM.rightName]) || defaults.rightName,
    nextSide: meta[FM.nextSide] === "left" ? "left" : "right",
    attachmentFolder: clean(meta[FM.attachmentFolder]) || defaults.attachmentFolder,
    leftBio: clean(meta[FM.leftBio]),
    rightBio: clean(meta[FM.rightBio]),
    leftAvatar: clean(meta[FM.leftAvatar]),
    rightAvatar: clean(meta[FM.rightAvatar]),
    backgroundColor: chatBackgroundColor(meta[FM.backgroundColor]),
    backgroundImage: chatBackgroundImage(meta[FM.backgroundImage]),
    preamble: "",
    messages: [],
  };
  if (!isConversation) return empty;

  const preamble: string[] = [];
  let current: { id: string; side: Side; timestamp: string; lines: string[]; skipDisplayHeading: boolean } | null = null;
  const push = () => {
    if (!current) return;
    empty.messages.push({ id: current.id, side: current.side, timestamp: current.timestamp, content: trimBlankLines(current.lines.join("\n")) });
    current = null;
  };
  for (const [lineIndex, line] of bodyLines.entries()) {
    const modern = markerIndexes.has(lineIndex) ? line.match(MODERN_MARKER_LINE_RE) : null;
    const legacy = markerIndexes.has(lineIndex) ? line.match(LEGACY_MARKER_RE) : null;
    if (modern) {
      push();
      current = { id: modern[3].trim(), side: modern[1].toLowerCase() as Side, timestamp: modern[2].trim(), lines: [], skipDisplayHeading: true };
    } else if (legacy) {
      push();
      current = { id: "", side: legacy[1].toLowerCase() as Side, timestamp: markerTimestamp(legacy[2] || ""), lines: [], skipDisplayHeading: false };
    } else if (current) {
      if (current.skipDisplayHeading) {
        current.skipDisplayHeading = false;
        if (isDisplayHeading(line, current.timestamp)) continue;
      }
      current.lines.push(line);
    }
    else preamble.push(line);
  }
  push();
  empty.preamble = trimBlankLines(preamble.join("\n"));
  return empty;
}

export function appendMessage(content: string, side: Side, timestamp: string, message: string, options?: AppendMessageOptions): string {
  const normalized = content.replace(/\r\n/g, "\n").trimEnd();
  const block = options
    ? `<!-- solomon-chat:${side}|${timestamp}|${cleanMarkerValue(options.messageId)} -->\n### ${escapeHeading(options.senderName)} · ${timestamp}\n\n${trimBlankLines(message)}\n`
    : `[${side}, ${timestamp}]\n${trimBlankLines(message)}\n`;
  return normalized ? `${normalized}\n\n${block}` : block;
}

export function appendMessageTransaction(content: string, options: AppendTransactionOptions): string {
  const withFrontmatter = upsertFrontmatter(content, {
    [FM.flag]: "true",
    [FM.conversationId]: quoteYaml(options.conversationId),
    [FM.leftName]: quoteYaml(options.leftName),
    [FM.rightName]: quoteYaml(options.rightName),
    [FM.nextSide]: options.nextSide,
    [FM.attachmentFolder]: quoteYaml(options.attachmentFolder),
  });
  return appendMessage(withFrontmatter, options.side, options.timestamp, options.message, options);
}

export function replaceMessage(content: string, messageIndex: number, replacement: string | null): string {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const hadFinalNewline = content.endsWith("\n");
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const markers = messageMarkerIndexes(lines);
  const start = markers[messageIndex];
  if (start == null) return content;
  const end = markers[messageIndex + 1] ?? lines.length;
  if (replacement == null) {
    let removeStart = start;
    while (removeStart > 0 && lines[removeStart - 1].trim() === "" && lines[removeStart - 2]?.trim() !== "---") removeStart--;
    lines.splice(removeStart, end - removeStart);
  } else {
    const replacementLines = trimBlankLines(replacement).split("\n");
    const modern = MODERN_MARKER_LINE_RE.test(lines[start]);
    const contentStart = modern && isDisplayHeading(lines[start + 1] || "", lines[start].match(MODERN_MARKER_LINE_RE)?.[2].trim() || "") ? start + 2 : start + 1;
    lines.splice(contentStart, end - contentStart, "", ...replacementLines, "");
  }
  let result = lines.join(eol);
  if (hadFinalNewline && !result.endsWith(eol)) result += eol;
  return result;
}

export function currentTimestamp(date = new Date()): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

export function hasMessageId(content: string, messageId: string): boolean {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  return messageMarkerIndexes(lines).some((index) => lines[index].match(MODERN_MARKER_LINE_RE)?.[3].trim() === messageId);
}

export function trimBlankLines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/^\s*\n/, "").replace(/\n\s*$/, "");
}

function clean(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function sameTarget(message: ChatMessage, target: MessageTarget): boolean {
  return message.side === target.side && message.timestamp === target.timestamp && message.content === target.content;
}
function markerTimestamp(value: string): string { return value.split(/\s*,\s*(?=[a-z][\w-]*=)/i, 1)[0].trim(); }
function readBoolean(value: unknown): boolean { return value === true || String(value).toLowerCase() === "true"; }
const LEGACY_MARKER_RE = /^\[(left|right)(?:\s*,\s*(.+?))?\]\s*$/i;
const MODERN_MARKER_LINE_RE = /^<!--\s*solomon-chat(?:-message)?:\s*(left|right)\s*\|\s*([^|]*?)\s*\|\s*([^|>]+?)\s*-->\s*$/i;
function isMessageMarker(line: string): boolean { return LEGACY_MARKER_RE.test(line) || MODERN_MARKER_LINE_RE.test(line); }
interface MarkdownFence { character: "`" | "~"; length: number }
function messageMarkerIndexes(lines: string[]): number[] {
  const indexes: number[] = [];
  let fence: MarkdownFence | null = null;
  lines.forEach((line, index) => {
    if (!fence && isMessageMarker(line)) indexes.push(index);
    fence = fenceAfterLine(line, fence);
  });
  return indexes;
}
function fenceAfterLine(line: string, fence: MarkdownFence | null): MarkdownFence | null {
  if (fence) {
    const closing = line.match(/^ {0,3}(`+|~+)[ \t]*$/);
    return closing && closing[1][0] === fence.character && closing[1].length >= fence.length ? null : fence;
  }
  const opening = line.match(/^ {0,3}(`{3,}|~{3,})/);
  return opening ? { character: opening[1][0] as "`" | "~", length: opening[1].length } : null;
}
function isDisplayHeading(line: string, timestamp: string): boolean { return line.startsWith("### ") && line.endsWith(` · ${timestamp}`); }
function cleanMarkerValue(value: string): string { return value.replace(/[|>\s]+/g, "-").replace(/^-+|-+$/g, "") || "message"; }
function escapeHeading(value: string): string {
  const escaped = ["\\", "`", "*", "_", "{", "}", "[", "]", "<", ">"].reduce((text, character) => text.replaceAll(character, `\\${character}`), value.trim());
  return escaped || "Unknown speaker";
}

export function replaceTargetMessage(content: string, target: MessageTarget, replacement: string | null): string {
  const parsed = parseConversation(content, {}, { leftName: "Left", rightName: "Right", attachmentFolder: "attachments" });
  let messageIndex = -1;
  if (target.id) {
    const matches = parsed.messages
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => message.id === target.id);
    if (matches.length === 1 && sameTarget(matches[0].message, target)) messageIndex = matches[0].index;
  } else {
    const matches = parsed.messages
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => message.side === target.side && message.timestamp === target.timestamp && message.content === target.content);
    if (matches.length === 1) messageIndex = matches[0].index;
  }
  if (messageIndex < 0) throw new Error("The message changed before the action could be completed.");
  return replaceMessage(content, messageIndex, replacement);
}
function quoteYaml(value: string): string { return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; }
function upsertFrontmatter(content: string, fields: Record<string, string>): string {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  let frontmatter: string[] = [];
  let body = lines;
  if (lines[0] === "---") {
    const end = lines.slice(1).findIndex((line) => line.trim() === "---");
    if (end >= 0) {
      frontmatter = lines.slice(1, end + 1);
      body = lines.slice(end + 2);
    }
  }
  for (const [key, value] of Object.entries(fields)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const index = frontmatter.findIndex((line) => new RegExp(`^${escaped}:`).test(line));
    const next = `${key}: ${value}`;
    if (index >= 0) frontmatter[index] = next;
    else frontmatter.push(next);
  }
  return ["---", ...frontmatter, "---", ...body].join("\n");
}
function unquoteYaml(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  return value;
}
