import { describe, expect, it } from "vitest";
import { attachmentMarkdown, attachmentValidationError, formatAttachmentSize, isImageAttachment } from "../src/attachments";

describe("attachments", () => {
  it("creates portable Markdown links and safely encodes difficult filenames", () => {
    const image = { name: "plan (final) #1.png", size: 2048, type: "image/png" };
    expect(attachmentMarkdown(image, "Reflection.attachments/plan (final) #1.png")).toBe("![plan (final) #1.png](Reflection.attachments/plan%20%28final%29%20%231.png)");
    expect(isImageAttachment(image)).toBe(true);
    expect(attachmentMarkdown({ name: "brief[1].pdf", size: 10, type: "application/pdf" }, "Reflection.attachments/brief[1].pdf")).toBe("[brief\\[1\\].pdf](Reflection.attachments/brief%5B1%5D.pdf)");
  });

  it("rejects mobile-unsafe batches before reading them into memory", () => {
    expect(attachmentValidationError([{ name: "huge.mov", size: 26 * 1024 * 1024, type: "video/quicktime" }])).toContain("25 MB");
    const files = Array.from({ length: 11 }, (_, index) => ({ name: `${index}.txt`, size: 1, type: "text/plain" }));
    expect(attachmentValidationError(files)).toContain("10 files");
  });

  it("formats compact human-readable file sizes", () => {
    expect(formatAttachmentSize(900)).toBe("900 B");
    expect(formatAttachmentSize(2048)).toBe("2 KB");
    expect(formatAttachmentSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});
