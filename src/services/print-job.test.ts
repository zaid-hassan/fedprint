import { describe, expect, it } from "vitest";
import { buildLpArgs, type SubmitInput } from "./print-job.js";
import type { PrinterCapabilities } from "./printer.js";
import type { PrintOptions } from "../validation/print-options.js";

const capabilities: PrinterCapabilities = {
  pageSizes: ["A4", "A5", "Letter"],
  colors: ["color", "grayscale"],
  duplex: false,
  colorOption: "BRMonoColor",
  colorValue: "FullColor",
  monoValue: "Mono",
};

function makeInput(overrides: Partial<PrintOptions> = {}, caps: Partial<PrinterCapabilities> = {}): SubmitInput {
  const options: PrintOptions = {
    copies: 2,
    pages: "all",
    orientation: "portrait",
    media: "A4",
    color: "color",
    sides: "one-sided",
    ...overrides,
  };
  return {
    filePath: "/tmp/example.pdf",
    displayName: "example.pdf",
    options,
    capabilities: { ...capabilities, ...caps },
    printerLabel: "Brother DCP T230",
  };
}

describe("buildLpArgs", () => {
  it("targets the configured printer with a safe file argument", () => {
    const args = buildLpArgs(makeInput());
    expect(args[0]).toBe("-d");
    expect(args[1]).toBe("DCPT230");
    expect(args).toContain("-t");
    expect(args).toContain("example.pdf");
    expect(args.at(-1)).toBe("/tmp/example.pdf");
    expect(args.at(-2)).toBe("--");
  });

  it("maps orientation, color and page range", () => {
    const args = buildLpArgs(makeInput({ orientation: "landscape", color: "grayscale", pages: "2-4" }));
    expect(args).toContain("orientation-requested=4");
    expect(args).toContain("BRMonoColor=Mono");
    expect(args).toContain("-P");
    expect(args[args.indexOf("-P") + 1]).toBe("2-4");
  });

  it("falls back to A4 when the requested media is unavailable", () => {
    const args = buildLpArgs(makeInput({ media: "A5" }, { pageSizes: ["A4"] }));
    expect(args).toContain("media=A4");
  });

  it("omits sides when duplex is unsupported", () => {
    const args = buildLpArgs(makeInput({ sides: "two-sided-long-edge" }));
    expect(args.some((arg) => arg.startsWith("sides="))).toBe(false);
  });

  it("includes sides when duplex is supported", () => {
    const args = buildLpArgs(makeInput({ sides: "two-sided-long-edge" }, { duplex: true }));
    expect(args).toContain("sides=two-sided-long-edge");
  });

  it("omits page list when printing all pages", () => {
    const args = buildLpArgs(makeInput({ pages: "all" }));
    expect(args).not.toContain("-P");
  });
});
