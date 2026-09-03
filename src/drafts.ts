export interface StoredDraft {
  sendingMessageId?: string;
  text: string;
  updatedAt: number;
  version: 1;
}

export type DraftMap = Record<string, StoredDraft>;
export type PendingCleanupMap = Record<string, string[]>;

export function draftKey(conversationId: string, filePath: string): string {
  return conversationId.trim() ? `conversation:${conversationId.trim()}` : `path:${filePath}`;
}

export function parseDraftMap(value: unknown): DraftMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: DraftMap = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    if (record.version !== 1 || typeof record.text !== "string" || typeof record.updatedAt !== "number") continue;
    const sendingMessageId = typeof record.sendingMessageId === "string" ? record.sendingMessageId.trim() : "";
    if (record.text || sendingMessageId) {
      result[key] = {
        version: 1,
        text: record.text,
        updatedAt: record.updatedAt,
        ...(sendingMessageId ? { sendingMessageId } : {}),
      };
    }
  }
  return result;
}

export function parsePendingCleanupMap(value: unknown): PendingCleanupMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: PendingCleanupMap = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!Array.isArray(candidate)) continue;
    const messageIds = [...new Set(candidate.filter((item): item is string => typeof item === "string")
      .map((item) => item.trim()).filter((item) => /^msg-[0-9a-f]{16}$/i.test(item)))];
    if (messageIds.length) result[key] = messageIds;
  }
  return result;
}

export function movePathDraft(drafts: DraftMap, oldPath: string, newPath: string): boolean {
  const oldKey = draftKey("", oldPath);
  const record = drafts[oldKey];
  if (!record) return false;
  delete drafts[oldKey];
  drafts[draftKey("", newPath)] = record;
  return true;
}

export function movePathPendingCleanups(cleanups: PendingCleanupMap, oldPath: string, newPath: string): boolean {
  const oldKey = draftKey("", oldPath);
  const records = cleanups[oldKey];
  if (!records) return false;
  delete cleanups[oldKey];
  const newKey = draftKey("", newPath);
  cleanups[newKey] = [...new Set([...(cleanups[newKey] || []), ...records])];
  return true;
}
