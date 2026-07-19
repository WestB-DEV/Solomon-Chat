export const FM = {
  flag: "solomon-chat",
  leftName: "left-name",
  rightName: "right-name",
  nextSide: "next-side",
  attachmentFolder: "attachment-folder",
  leftBio: "left-bio",
  rightBio: "right-bio",
  leftAvatar: "left-avatar",
  rightAvatar: "right-avatar",
} as const;

export type Side = "left" | "right";

export interface SolomonSettings {
  defaultLeftName: string;
  defaultRightName: string;
  conversationFolder: string;
  useThemeColors: boolean;
  leftBubbleColor: string;
  rightBubbleColor: string;
  leftTextColor: string;
  rightTextColor: string;
  showTimestamps: boolean;
  autoFocusComposer: boolean;
  showPerspectivePrompts: boolean;
}

export const DEFAULT_SETTINGS: SolomonSettings = {
  defaultLeftName: "Wise Friend",
  defaultRightName: "Me",
  conversationFolder: "Solomon Conversations",
  useThemeColors: true,
  leftBubbleColor: "#e9e9eb",
  rightBubbleColor: "#8b6cef",
  leftTextColor: "#1c1c1e",
  rightTextColor: "#ffffff",
  showTimestamps: true,
  autoFocusComposer: true,
  showPerspectivePrompts: true,
};

export const PERSPECTIVE_PROMPTS = [
  "If a close friend brought me this problem, what would I tell them?",
  "What might I be missing or unable to know yet?",
  "How could each person involved see this differently?",
  "What compromise or middle path might be possible?",
  "What is likely to change with time?",
  "Looking back a year from now, what choice would feel wise?",
];
