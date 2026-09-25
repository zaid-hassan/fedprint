import { describe, expect, it } from "vitest";
import { MAX_DIAGRAMS, MAX_MARKDOWN_CHARS, parseMarkdownBody } from "./markdown.js";

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("parseMarkdownBody", () => {
  it("returns trimmed markdown and no diagrams by default", () => {
    const body = parseMarkdownBody({ markdown: "  # Hello  " });
    expect(body.markdown).toBe("# Hello");
    expect(body.diagrams).toEqual([]);
  });

  it("decodes diagram data URLs and preserves null placeholders", () => {
    const body = parseMarkdownBody({ markdown: "# X", diagrams: [PNG_DATA_URL, null] });
    expect(body.diagrams).toHaveLength(2);
    expect(Buffer.isBuffer(body.diagrams[0])).toBe(true);
    expect((body.diagrams[0] as Buffer).subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(body.diagrams[1]).toBeNull();
  });

  it("rejects empty or whitespace-only content", () => {
    expect(() => parseMarkdownBody({ markdown: "" })).toThrow();
    expect(() => parseMarkdownBody({ markdown: "   \n  " })).toThrow();
  });

  it("rejects a missing or non-string markdown field", () => {
    expect(() => parseMarkdownBody({})).toThrow();
    expect(() => parseMarkdownBody({ markdown: 42 })).toThrow();
  });

  it("rejects content beyond the size limit", () => {
    expect(() => parseMarkdownBody({ markdown: "a".repeat(MAX_MARKDOWN_CHARS + 1) })).toThrow();
  });

  it("rejects invalid or non-PNG diagram data", () => {
    expect(() => parseMarkdownBody({ markdown: "# X", diagrams: ["not-a-data-url"] })).toThrow();
    expect(() => parseMarkdownBody({ markdown: "# X", diagrams: ["data:image/png;base64,@@@"] })).toThrow();
    expect(() => parseMarkdownBody({ markdown: "# X", diagrams: [123] })).toThrow();
  });

  it("rejects too many diagrams", () => {
    const diagrams = Array.from({ length: MAX_DIAGRAMS + 1 }, () => null);
    expect(() => parseMarkdownBody({ markdown: "# X", diagrams })).toThrow();
  });
});