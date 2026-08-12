export const CONTINUATION_SOFT_BYTE_LIMIT = 250 * 1024;
export const CONTINUATION_SOFT_MESSAGE_LIMIT = 2_000;

const TOP_START = "<!-- solomon-continuation-top -->";
const TOP_END = "<!-- /solomon-continuation-top -->";
const BOTTOM_START = "<!-- solomon-continuation-bottom -->";
const BOTTOM_END = "<!-- /solomon-continuation-bottom -->";

export interface ContinuationMetadata {
  conversationId: string;
  segmentIndex: number;
  previousSegment: string | null;
  nextSegment: string | null;
}

export interface ContinuationSegment extends ContinuationMetadata {
  fileName: string;
  content: string;
  messageMarkdown: string;
  visiblePreviousSegment: string | null;
  visibleNextSegment: string | null;
}

export interface BuildContinuationSegmentOptions {
  baseName: string;
  conversationId: string;
  segmentIndex: number;
  messageMarkdown: string;
  hasNext?: boolean;
}

export interface RolloverAssessment {
  byteCount: number;
  messageCount: number;
  byteLimit: number;
  messageLimit: number;
  shouldOfferContinuation: boolean;
  reasons: Array<"bytes" | "messages">;
}

export interface ContinuationFile {
  fileName: string;
  content: string;
}

export interface ContinuationRepairIssue {
  fileName: string;
  field: "previous" | "next";
  expected: string | null;
  metadataActual: string | null;
  visibleActual: string | null;
}

export interface ContinuationRepair {
  fileName: string;
  content: string;
  issues: ContinuationRepairIssue[];
}

export interface ContinuationRepairPlan {
  issues: ContinuationRepairIssue[];
  repairs: ContinuationRepair[];
}

/** Returns a filename only, ensuring every segment remains beside the base note. */
export function continuationFileName(baseName: string, segmentIndex: number): string {
  const cleanBase = normalizeBaseName(baseName);
  assertSegmentIndex(segmentIndex);
  return segmentIndex === 1
    ? `${cleanBase}.md`
    : `${cleanBase} — Part ${String(segmentIndex).padStart(3, "0")}.md`;
}

/** Creates ordinary Markdown with Obsidian properties and standard wikilinks. */
export function buildContinuationSegment(options: BuildContinuationSegmentOptions): ContinuationFile {
  assertConversationId(options.conversationId);
  assertSegmentIndex(options.segmentIndex);
  const fileName = continuationFileName(options.baseName, options.segmentIndex);
  const previous = options.segmentIndex > 1
    ? continuationFileName(options.baseName, options.segmentIndex - 1)
    : null;
  const next = options.hasNext
    ? continuationFileName(options.baseName, options.segmentIndex + 1)
    : null;
  const properties = [
    "---",
    "solomon-chat: true",
    `conversation_id: ${yamlString(options.conversationId)}`,
    `segment_index: ${options.segmentIndex}`,
    ...(previous ? [`prev_segment: ${yamlString(toWikilink(previous))}`] : []),
    ...(next ? [`next_segment: ${yamlString(toWikilink(next))}`] : []),
    "---",
  ].join("\n");
  const content = [
    properties,
    renderNavigation("previous", previous),
    normalizeMarkdown(options.messageMarkdown),
    renderNavigation("next", next),
  ].filter(Boolean).join("\n\n");
  return { fileName, content: `${content}\n` };
}

/** Reads both current snake_case properties and legacy hyphenated/property aliases. */
export function parseContinuationSegment(file: ContinuationFile): ContinuationSegment | null {
  const { properties, body } = splitFrontmatter(file.content);
  const conversationId = readProperty(properties, ["conversation_id", "conversation-id"]);
  const rawIndex = readProperty(properties, ["segment_index", "segment-index"]);
  const segmentIndex = Number(rawIndex);
  if (!conversationId || !Number.isInteger(segmentIndex) || segmentIndex < 1) return null;
  const previousSegment = readLinkProperty(properties, [
    "prev_segment", "previous_segment", "prev-segment", "previous-segment",
  ]);
  const nextSegment = readLinkProperty(properties, ["next_segment", "next-segment"]);
  return {
    fileName: file.fileName,
    content: file.content,
    conversationId,
    segmentIndex,
    previousSegment,
    nextSegment,
    visiblePreviousSegment: readNavigation(body, "previous"),
    visibleNextSegment: readNavigation(body, "next"),
    messageMarkdown: stripNavigation(body).trim(),
  };
}

export function countConversationMessages(markdown: string): number {
  return Array.from(markdown.matchAll(/^\[(?:left|right)(?:\s*,[^\]]*)?\]\s*$/gim)).length;
}

/** Advisory only: callers may offer a continuation, but must never force one. */
export function assessContinuationRollover(
  markdown: string,
  messageCount = countConversationMessages(markdown),
): RolloverAssessment {
  const byteCount = new TextEncoder().encode(markdown).byteLength;
  const reasons: Array<"bytes" | "messages"> = [];
  if (byteCount >= CONTINUATION_SOFT_BYTE_LIMIT) reasons.push("bytes");
  if (messageCount >= CONTINUATION_SOFT_MESSAGE_LIMIT) reasons.push("messages");
  return {
    byteCount,
    messageCount,
    byteLimit: CONTINUATION_SOFT_BYTE_LIMIT,
    messageLimit: CONTINUATION_SOFT_MESSAGE_LIMIT,
    shouldOfferContinuation: reasons.length > 0,
    reasons,
  };
}

/**
 * Detects missing or one-sided chain links and returns deterministic, non-mutating
 * replacements. Message Markdown is preserved byte-for-byte apart from surrounding
 * navigation whitespace.
 */
export function planContinuationRepairs(files: ContinuationFile[]): ContinuationRepairPlan {
  const parsed = files.map(parseContinuationSegment).filter((item): item is ContinuationSegment => item !== null);
  const byConversation = new Map<string, ContinuationSegment[]>();
  for (const segment of parsed) {
    const group = byConversation.get(segment.conversationId) ?? [];
    group.push(segment);
    byConversation.set(segment.conversationId, group);
  }
  const issues: ContinuationRepairIssue[] = [];
  const repairs: ContinuationRepair[] = [];
  for (const group of byConversation.values()) {
    group.sort((a, b) => a.segmentIndex - b.segmentIndex || a.fileName.localeCompare(b.fileName));
    const byIndex = new Map(group.map((segment) => [segment.segmentIndex, segment]));
    for (const segment of group) {
      const expectedPrevious = byIndex.get(segment.segmentIndex - 1)?.fileName ?? null;
      const expectedNext = byIndex.get(segment.segmentIndex + 1)?.fileName ?? null;
      const segmentIssues: ContinuationRepairIssue[] = [];
      checkDirection(segment, "previous", expectedPrevious, segmentIssues);
      checkDirection(segment, "next", expectedNext, segmentIssues);
      if (segmentIssues.length === 0) continue;
      issues.push(...segmentIssues);
      repairs.push({
        fileName: segment.fileName,
        content: repairSegmentContent(segment.content, expectedPrevious, expectedNext),
        issues: segmentIssues,
      });
    }
  }
  return { issues, repairs };
}

/** Applies expected neighbor identities to the latest file content. */
export function applyContinuationRepair(content: string, previous: string | null, next: string | null): string {
  return repairSegmentContent(content, previous, next);
}

function checkDirection(
  segment: ContinuationSegment,
  field: "previous" | "next",
  expected: string | null,
  target: ContinuationRepairIssue[],
): void {
  const metadataActual = field === "previous" ? segment.previousSegment : segment.nextSegment;
  const visibleActual = field === "previous" ? segment.visiblePreviousSegment : segment.visibleNextSegment;
  if (metadataActual !== expected || visibleActual !== expected) {
    target.push({ fileName: segment.fileName, field, expected, metadataActual, visibleActual });
  }
}

function repairSegmentContent(content: string, previous: string | null, next: string | null): string {
  const { frontmatterLines, body } = splitFrontmatter(content);
  const properties = frontmatterLines.length > 0 ? [...frontmatterLines] : ["---", "---"];
  upsertAliasedProperty(properties, ["prev_segment", "previous_segment", "prev-segment", "previous-segment"], "prev_segment", previous);
  upsertAliasedProperty(properties, ["next_segment", "next-segment"], "next_segment", next);
  const messages = stripNavigation(body).trim();
  const rebuilt = [
    properties.join("\n"),
    renderNavigation("previous", previous),
    messages,
    renderNavigation("next", next),
  ].filter(Boolean).join("\n\n");
  return `${rebuilt}\n`;
}

function upsertAliasedProperty(
  lines: string[], aliases: string[], canonical: string, value: string | null,
): void {
  const expression = new RegExp(`^\\s*(?:${aliases.map(escapeRegExp).join("|")})\\s*:`);
  const indexes = lines.map((line, index) => expression.test(line) ? index : -1).filter((index) => index >= 0);
  for (let index = indexes.length - 1; index >= 0; index--) lines.splice(indexes[index], 1);
  if (value) lines.splice(lines.length - 1, 0, `${canonical}: ${yamlString(toWikilink(value))}`);
}

function renderNavigation(direction: "previous" | "next", fileName: string | null): string {
  if (!fileName) return "";
  const visible = direction === "previous"
    ? `> ← Previous: ${toWikilink(fileName)}`
    : `> Continue: ${toWikilink(fileName)} →`;
  const start = direction === "previous" ? TOP_START : BOTTOM_START;
  const end = direction === "previous" ? TOP_END : BOTTOM_END;
  return `${start}\n${visible}\n${end}`;
}

function readNavigation(body: string, direction: "previous" | "next"): string | null {
  const start = direction === "previous" ? TOP_START : BOTTOM_START;
  const end = direction === "previous" ? TOP_END : BOTTOM_END;
  const block = body.match(new RegExp(`${escapeRegExp(start)}([\\s\\S]*?)${escapeRegExp(end)}`))?.[1] ?? "";
  return readWikilink(block);
}

function stripNavigation(body: string): string {
  return body
    .replace(new RegExp(`${escapeRegExp(TOP_START)}[\\s\\S]*?${escapeRegExp(TOP_END)}\\s*`, "g"), "")
    .replace(new RegExp(`\\s*${escapeRegExp(BOTTOM_START)}[\\s\\S]*?${escapeRegExp(BOTTOM_END)}`, "g"), "");
}

function splitFrontmatter(content: string): {
  properties: Map<string, string>;
  frontmatterLines: string[];
  body: string;
} {
  const normalized = content.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) return { properties: new Map(), frontmatterLines: [], body: normalized };
  const properties = new Map<string, string>();
  for (const line of match[1].split("\n")) {
    const property = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (property) properties.set(property[1], unquote(property[2].trim()));
  }
  return {
    properties,
    frontmatterLines: ["---", ...match[1].split("\n"), "---"],
    body: normalized.slice(match[0].length),
  };
}

function readProperty(properties: Map<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const value = properties.get(alias);
    if (value != null) return value.trim();
  }
  return "";
}

function readLinkProperty(properties: Map<string, string>, aliases: string[]): string | null {
  return readWikilink(readProperty(properties, aliases));
}

function readWikilink(value: string): string | null {
  const target = value.match(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/)?.[1]?.trim();
  if (!target) return null;
  return target.endsWith(".md") ? target : `${target}.md`;
}

function toWikilink(fileName: string): string {
  return `[[${fileName.replace(/\.md$/i, "")}]]`;
}

function normalizeBaseName(baseName: string): string {
  const clean = baseName.trim().replace(/\.md$/i, "");
  if (!clean || /[\\/]/.test(clean) || clean === "." || clean === "..") {
    throw new Error("baseName must be a same-directory Markdown basename");
  }
  return clean;
}

function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n").trim();
}

function assertConversationId(value: string): void {
  if (!value.trim() || /[\r\n]/.test(value)) throw new Error("conversationId must be a non-empty single line");
}

function assertSegmentIndex(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 999) {
    throw new Error("segmentIndex must be an integer from 1 through 999");
  }
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function unquote(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value) as string; } catch { return value.slice(1, -1); }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  return value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
