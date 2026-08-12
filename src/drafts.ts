export interface DurableDraft {
  conversationId: string;
  filePath: string;
  text: string;
  attachmentPaths: string[];
  operationId?: string;
  operationSide?: "left" | "right";
  updatedAt: number;
}

export interface DraftEnvelope {
  version: 1;
  drafts: Record<string, DurableDraft>;
}

export const EMPTY_DRAFTS: DraftEnvelope = { version: 1, drafts: {} };

export function normalizeDraftEnvelope(value: unknown): DraftEnvelope {
  if (!value || typeof value !== "object") return { version: 1, drafts: {} };
  const candidate = value as Partial<DraftEnvelope>;
  if (candidate.version !== 1 || !candidate.drafts || typeof candidate.drafts !== "object") return { version: 1, drafts: {} };
  const drafts: Record<string, DurableDraft> = {};
  for (const [key, draft] of Object.entries(candidate.drafts)) {
    if (!draft || typeof draft !== "object") continue;
    const item = draft as Partial<DurableDraft>;
    if (typeof item.conversationId !== "string" || typeof item.filePath !== "string" || typeof item.text !== "string") continue;
    drafts[key] = { conversationId: item.conversationId, filePath: item.filePath, text: item.text, attachmentPaths: Array.isArray(item.attachmentPaths) ? item.attachmentPaths.filter((path): path is string => typeof path === "string") : [], updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : 0, operationId: typeof item.operationId === "string" ? item.operationId : undefined, operationSide: item.operationSide === "left" || item.operationSide === "right" ? item.operationSide : undefined };
  }
  return { version: 1, drafts };
}

export function draftKey(conversationId: string, filePath: string): string {
  return conversationId ? `conversation:${conversationId}` : `path:${filePath}`;
}

export function upsertDraft(envelope: DraftEnvelope, draft: DurableDraft): DraftEnvelope {
  const drafts = { ...envelope.drafts };
  const key = draftKey(draft.conversationId, draft.filePath);
  if (!draft.text && !draft.attachmentPaths.length) delete drafts[key];
  else drafts[key] = { ...draft, attachmentPaths: [...draft.attachmentPaths] };
  return { version: 1, drafts };
}

export function moveDraft(envelope: DraftEnvelope, oldConversationId: string, oldPath: string, conversationId: string, filePath: string): DraftEnvelope {
  const oldKey = draftKey(oldConversationId, oldPath);
  const existing = envelope.drafts[oldKey];
  if (!existing) return envelope;
  const drafts = { ...envelope.drafts };
  delete drafts[oldKey];
  drafts[draftKey(conversationId, filePath)] = { ...existing, conversationId, filePath };
  return { version: 1, drafts };
}
