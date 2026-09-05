import { describe, expect, it } from "vitest";
import { chatBackgroundColor, chatBackgroundImage } from "../src/background";
import { parseConversation, appendMessage } from "../src/model";

describe("chat backgrounds", () => {
  it("accepts only explicit hexadecimal colors or the theme default", () => {
    expect(chatBackgroundColor(" #Ab12eF ")).toBe("#ab12ef");
    for (const value of [null, {}, "", "red", "url(https://example.com)", "#fff; color:red"]) expect(chatBackgroundColor(value)).toBe("");
  });
  it("accepts vault-relative raster images only", () => {
    expect(chatBackgroundImage(" Wallpapers/Quiet sky.JPG ")).toBe("Wallpapers/Quiet sky.JPG");
    for (const value of ["https://example.com/a.png", "C:/a.png", "/a.png", "../a.png", "a/../b.png", "a.svg", "a.png\n", "a.png?x=1", "a\\b.png"]) expect(chatBackgroundImage(value)).toBe("");
  });
  it("restores per-chat choices from Markdown and preserves them when appending", () => {
    const text='---\nsolomon-chat: true\nchat-background-color: "#aabbcc"\nchat-background-image: "Wallpapers/sky.png"\n---\n';
    const chat=parseConversation(appendMessage(text,"right","now","Hello"), {}, {leftName:"A",rightName:"B",attachmentFolder:""});
    expect(chat.backgroundColor).toBe("#aabbcc");expect(chat.backgroundImage).toBe("Wallpapers/sky.png");
  });
});
