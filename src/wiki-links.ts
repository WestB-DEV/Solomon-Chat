export interface WikiLinkRange { from: number; to: number; query: string }

export function wikiLinkAtCursor(text: string, start: number, end: number): WikiLinkRange | null {
  if (start !== end) return null;
  const before = text.slice(0, start);
  const from = before.lastIndexOf("[[");
  if (from < 0) return null;
  const query = before.slice(from + 2);
  if (/[[\]\n\r|#]/.test(query)) return null;
  // Do not offer note completions inside inline or fenced code.
  if ((before.match(/`/g)?.length || 0) % 2) return null;
  const close = text.indexOf("]]", start);
  const tail = close < 0 ? "" : text.slice(start, close);
  return { from, to: close >= 0 && !/[[\]\n\r]/.test(tail) ? close + 2 : start, query };
}

export function completeWikiLink(text: string, range: WikiLinkRange, target: string): { text: string; cursor: number } {
  const link = `[[${target}]]`;
  return { text: text.slice(0, range.from) + link + text.slice(range.to), cursor: range.from + link.length };
}
