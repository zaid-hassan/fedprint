import { describe, expect, it } from "vitest";
import { parsePageRange, parsePrintOptions } from "./print-options.js";

describe("parsePageRange", () => {
  it("accepts all and empty input", () => {
    expect(parsePageRange("all")).toBe("all");
    expect(parsePageRange("ALL")).toBe("all");
    expect(parsePageRange("")).toBe("all");
    expect(parsePageRange("   ")).toBe("all");
  });

  it("accepts single pages and ranges", () => {
    expect(parsePageRange("1-3")).toBe("1-3");
    expect(parsePageRange("1,3,5")).toBe("1,3,5");
    expect(parsePageRange(" 2 - 4 , 7 ")).toBe("2-4,7");
    expect(parsePageRange("5")).toBe("5");
  });

  it("rejects malformed ranges", () => {
    expect(() => parsePageRange("3-1")).toThrow();
    expect(() => parsePageRange("0")).toThrow();
    expect(() => parsePageRange("abc")).toThrow();
    expect(() => parsePageRange("1-")).toThrow();
    expect(() => parsePageRange("1,,2")).toThrow();
  });
});

describe("parsePrintOptions", () => {
  it("applies defaults when fields are missing", () => {
    expect(parsePrintOptions({})).toEqual({
      copies: 1,
      pages: "all",
      orientation: "portrait",
      media: "A4",
      color: "color",
      sides: "one-sided",
    });
  });

  it("coerces string fields from multipart", () => {
    const options = parsePrintOptions({
      copies: "3",
      pages: "1-2",
      orientation: "landscape",
      media: "Letter",
      color: "grayscale",
      sides: "two-sided-long-edge",
    });
    expect(options.copies).toBe(3);
    expect(options.pages).toBe("1-2");
    expect(options.orientation).toBe("landscape");
    expect(options.media).toBe("Letter");
    expect(options.color).toBe("grayscale");
    expect(options.sides).toBe("two-sided-long-edge");
  });

  it("ignores empty string fields and uses defaults", () => {
    expect(parsePrintOptions({ copies: "", media: "" }).copies).toBe(1);
    expect(parsePrintOptions({ copies: "", media: "" }).media).toBe("A4");
  });

  it("rejects out-of-range copies and unknown values", () => {
    expect(() => parsePrintOptions({ copies: "0" })).toThrow();
    expect(() => parsePrintOptions({ copies: "21" })).toThrow();
    expect(() => parsePrintOptions({ media: "A3" })).toThrow();
    expect(() => parsePrintOptions({ orientation: "sideways" })).toThrow();
  });
});
