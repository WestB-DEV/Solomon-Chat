export function chatBackgroundColor(value: unknown): string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : "";
}

export function chatBackgroundImage(value: unknown): string {
  if (typeof value !== "string" || Array.from(value).some((character) => character.charCodeAt(0) < 32)) return "";
  const path = value.trim();
  if (!path || /[:\\?#]/.test(path) || path.startsWith("/") || path.split("/").some((part) => !part || part === "." || part === "..")) return "";
  return /\.(png|jpe?g|webp|gif|avif)$/i.test(path) ? path : "";
}
