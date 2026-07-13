import type { Side } from "./constants";
import { FM } from "./constants";

export interface ChatMessage {
  side: Side;
  timestamp: string;
  content: string;
}

export interface Conversation {
  isConversation: boolean;
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
  const hasMarkers = /^\[(left|right)(?:\s*,\s*.+?)?\]\s*$/im.test(body);
  const isConversation = readBoolean(meta[FM.flag]) || (hasMarkers && Object.values(FM).some((key) => meta[key] != null));
  const empty: Conversation = {
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
    messages: [],
  };
  if (!isConversation) return empty;

  const preamble: string[] = [];
  let current: { side: Side; timestamp: string; lines: string[] } | null = null;
  const push = () => {
    if (!current) return;
    empty.messages.push({ side: current.side, timestamp: current.timestamp, content: trimBlankLines(current.lines.join("\n")) });
    current = null;
  };
  for (const line of body.split("\n")) {
    const match = line.match(/^\[(left|right)(?:\s*,\s*(.+?))?\]\s*$/i);
    if (match) {
      push();
      current = { side: match[1].toLowerCase() as Side, timestamp: (match[2] || "").trim(), lines: [] };
    } else if (current) current.lines.push(line);
    else preamble.push(line);
  }
  push();
  empty.preamble = trimBlankLines(preamble.join("\n"));
  return empty;
}

export function appendMessage(content: string, side: Side, timestamp: string, message: string): string {
  const normalized = content.replace(/\r\n/g, "\n").trimEnd();
  const block = `[${side}, ${timestamp}]\n${trimBlankLines(message)}\n`;
  return normalized ? `${normalized}\n\n${block}` : block;
}

export function replaceMessage(content: string, messageIndex: number, replacement: string | null): string {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const markers: number[] = [];
  lines.forEach((line, index) => {
    if (/^\[(left|right)(?:\s*,\s*.+?)?\]\s*$/i.test(line)) markers.push(index);
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
