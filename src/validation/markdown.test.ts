import { describe, expect, it } from "vitest";
import { MAX_MARKDOWN_CHARS, parseMarkdownBody } from "./markdown.js";

describe("parseMarkdownBody", () => {
  it("returns trimmed markdown", () => {
    expect(parseMarkdownBody({ markdown: "  # Hello  " })).toBe("# Hello");
  });

  it("rejects empty or whitespace-only content", () => {
    expect(() => parseMarkdownBody({ markdown: "" })).toThrow();
    expect(() => parseMarkdownBody({ markdown: "   \n  " })).toThrow();
  });

  it("rejects a missing or non-string field", () => {
    expect(() => parseMarkdownBody({})).toThrow();
    expect(() => parseMarkdownBody({ markdown: 42 })).toThrow();
  });

  it("rejects content beyond the size limit", () => {
    expect(() => parseMarkdownBody({ markdown: "a".repeat(MAX_MARKDOWN_CHARS + 1) })).toThrow();
  });
});
