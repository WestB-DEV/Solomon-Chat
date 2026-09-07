import type { Editor, EditorPosition, MarkdownView, TFile } from "obsidian";

type SourceView = Pick<MarkdownView, "file" | "editor" | "containerEl">;

export interface LinkedConversationSource {
  readonly sourcePath: string;
  readonly view: SourceView;
  readonly file: TFile;
  readonly editor: Editor;
  readonly text: string;
  readonly cursor: EditorPosition;
}

/** Capture before opening the dialog; never look up a different active editor on save. */
export function captureLinkedConversationSource(view: SourceView): LinkedConversationSource | null {
  if (!view.file || !view.containerEl.isConnected) return null;
  return {
    sourcePath: view.file.path,
    view,
    file: view.file,
    editor: view.editor,
    text: view.editor.getValue(),
    cursor: { ...view.editor.getCursor("head") }
  };
}

/** Call before creating the conversation, and again after the asynchronous file creation. */
export function isLinkedConversationSourceCurrent(source: LinkedConversationSource): boolean {
  return source.view.containerEl.isConnected
    && source.view.file === source.file
    && source.file.path === source.sourcePath
    && source.view.editor === source.editor
    && source.editor.getValue() === source.text;
}

/** The caller supplies FileManager.generateMarkdownLink output to respect vault preferences. */
export function insertLinkedConversationLink(source: LinkedConversationSource, link: string): boolean {
  if (!isLinkedConversationSourceCurrent(source)) return false;
  source.editor.replaceRange(link, source.cursor);
  return true;
}
