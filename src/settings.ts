import { PluginSettingTab, Setting } from "obsidian";
import type SolomonChatPlugin from "./plugin";

// The imperative settings API preserves compatibility with the declared Obsidian 1.6 minimum.
export class SolomonSettingsTab extends PluginSettingTab {
  constructor(app: SolomonChatPlugin["app"], private readonly owner: SolomonChatPlugin) { super(app, owner); }

  display(): void {
    this.renderSettings();
  }

  private renderSettings(): void {
    this.containerEl.empty();
    new Setting(this.containerEl).setName("Default wise-side name").setDesc("Used for the left side of new conversations.")
      .addText((text) => text.setValue(this.owner.settings.defaultLeftName).onChange(async (value) => {
        this.owner.settings.defaultLeftName = value.trim() || "Wise Friend"; await this.owner.saveSettings();
      }));
    new Setting(this.containerEl).setName("Default self-side name").setDesc("Used for the right side of new conversations.")
      .addText((text) => text.setValue(this.owner.settings.defaultRightName).onChange(async (value) => {
        this.owner.settings.defaultRightName = value.trim() || "Me"; await this.owner.saveSettings();
      }));
    new Setting(this.containerEl).setName("Conversation folder").setDesc("New Markdown conversations are created here.")
      .addText((text) => text.setValue(this.owner.settings.conversationFolder).onChange(async (value) => {
        this.owner.settings.conversationFolder = value.trim(); await this.owner.saveSettings();
      }));
    new Setting(this.containerEl).setName("Show timestamps").setDesc("Show the speaker and time above each bubble.")
      .addToggle((toggle) => toggle.setValue(this.owner.settings.showTimestamps).onChange(async (value) => {
        this.owner.settings.showTimestamps = value; await this.owner.saveSettings(); this.owner.refreshAllLeaves();
      }));
    new Setting(this.containerEl).setName("Perspective prompts").setDesc("Show optional self-distancing prompts in the chat header.")
      .addToggle((toggle) => toggle.setValue(this.owner.settings.showPerspectivePrompts).onChange(async (value) => {
        this.owner.settings.showPerspectivePrompts = value; await this.owner.saveSettings(); this.owner.refreshAllLeaves();
      }));
    new Setting(this.containerEl).setName("Auto-focus composer").setDesc("Focus the message box when a conversation opens.")
      .addToggle((toggle) => toggle.setValue(this.owner.settings.autoFocusComposer).onChange(async (value) => {
        this.owner.settings.autoFocusComposer = value; await this.owner.saveSettings();
      }));
    new Setting(this.containerEl).setName("Use theme colors").setDesc("Adapt bubble colors to the active Obsidian theme.")
      .addToggle((toggle) => toggle.setValue(this.owner.settings.useThemeColors).onChange(async (value) => {
        this.owner.settings.useThemeColors = value; await this.owner.saveSettings(); this.owner.refreshAllLeaves(); this.renderSettings();
      }));
    if (!this.owner.settings.useThemeColors) this.addColorSettings();
  }

  private addColorSettings(): void {
    const color = (name: string, key: "leftBubbleColor" | "rightBubbleColor" | "leftTextColor" | "rightTextColor") => {
      new Setting(this.containerEl).setName(name).addColorPicker((picker) => picker.setValue(this.owner.settings[key]).onChange(async (value) => {
        this.owner.settings[key] = value; await this.owner.saveSettings(); this.owner.refreshAllLeaves();
      }));
    };
    color("Left bubble", "leftBubbleColor"); color("Left text", "leftTextColor");
    color("Right bubble", "rightBubbleColor"); color("Right text", "rightTextColor");
  }
}
