export interface ChatRouteInput {
  conversation: boolean;
  filePath: string;
  markdownView: boolean;
  rawPath?: string;
  routing: boolean;
}

export function shouldRouteToChat(input: ChatRouteInput): boolean {
  return input.markdownView
    && !input.routing
    && input.conversation
    && input.rawPath !== input.filePath;
}

export interface ComposerKeyInput {
  composing: boolean;
  key: string;
  mobile: boolean;
  shift: boolean;
}

export function shouldSubmitComposerKey(input: ComposerKeyInput): boolean {
  return !input.mobile && input.key === "Enter" && !input.shift && !input.composing;
}
