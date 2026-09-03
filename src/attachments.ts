export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_MESSAGE_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export interface AttachmentLike {
  name: string;
  size: number;
  type: string;
}

export function attachmentValidationError(files: AttachmentLike[], existing: AttachmentLike[] = []): string | null {
  if (existing.length + files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return `Attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files to one message.`;
  }
  const oversized = files.find((file) => file.size > MAX_ATTACHMENT_BYTES);
  if (oversized) return `${oversized.name} is larger than the 25 MB mobile-safe limit.`;
  const total = [...existing, ...files].reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_MESSAGE_ATTACHMENT_BYTES) return "Attachments for one message can total up to 50 MB.";
  return null;
}

export function attachmentMarkdown(file: AttachmentLike, relativePath: string): string {
  const label = escapeMarkdownLabel(file.name);
  const target = encodeMarkdownTarget(relativePath);
  return isImageAttachment(file) ? `![${label}](${target})` : `[${label}](${target})`;
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function isImageAttachment(file: AttachmentLike): boolean {
  return file.type.startsWith("image/") || /\.(avif|gif|heic|jpeg|jpg|png|svg|webp)$/i.test(file.name);
}

function escapeMarkdownLabel(value: string): string { return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]"); }
function encodeMarkdownTarget(value: string): string {
  return encodeURI(value).replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/#/g, "%23");
}
