import fsp from "node:fs/promises";
import { afterAll, describe, expect, it } from "vitest";
import { deriveDocumentName, renderMarkdownToPdf } from "./markdown.js";
import { removeFile } from "./file-manager.js";

const created: string[] = [];

afterAll(async () => {
  await Promise.all(created.map((filePath) => removeFile(filePath)));
});

describe("deriveDocumentName", () => {
  it("uses the first heading", () => {
    expect(deriveDocumentName("# Meeting notes\n\nbody text")).toBe("Meeting notes.pdf");
  });

  it("uses the first non-empty line when there is no heading", () => {
    expect(deriveDocumentName("\n\nInvoice 42\nmore")).toBe("Invoice 42.pdf");
  });

  it("strips markdown syntax and link targets", () => {
    expect(deriveDocumentName("**Bold** and [link](http://example.com)")).toBe("Bold and link.pdf");
  });

  it("falls back when there is no content", () => {
    expect(deriveDocumentName("   \n\n\t")).toBe("document.pdf");
  });
});

describe("renderMarkdownToPdf", () => {
  it("renders common markdown constructs to a valid PDF", async () => {
    const markdown = [
      "# Title",
      "",
      "Hello **world**, this is *italic* and `code`.",
      "",
      "- first",
      "- second",
      "",
      "1. one",
      "2. two",
      "",
      "> a quote",
      "",
      "```",
      "const x = 1;",
      "```",
      "",
      "---",
      "",
      "| a | b |",
      "| - | - |",
      "| 1 | 2 |",
    ].join("\n");

    const filePath = await renderMarkdownToPdf(markdown, "A4");
    created.push(filePath);

    const content = await fsp.readFile(filePath);
    expect(content.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(content.length).toBeGreaterThan(500);
  });
});
