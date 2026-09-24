import { describe, expect, it } from "vitest";
import {
  friendlyNameFromUri,
  parseCapabilities,
  parseCurrentJob,
  parseDeviceUri,
  parseJobs,
  parsePrinterStatus,
  parseRequestId,
} from "./cups-parsers.js";

const IDLE =
  "printer DCPT230 is idle.  enabled since Thu Sep 24 14:43:41 2026";
const PRINTING =
  "printer DCPT230 now printing DCPT230-42.  enabled since Thu Sep 24 14:43:41 2026";
const DISABLED =
  "printer DCPT230 disabled since Thu Sep 24 14:43:41 2026 -";

const LPOPTIONS_OUTPUT = [
  "PageSize/Media Size: A4 BrA4_B *Letter BrLetter_B Legal Executive A5 A6",
  "BRInputSlot/Paper Source: *AutoSelect",
  "BRResolution/Print Quality: Draft *Normal Fine",
  "BRMonoColor/Color / Mono: *FullColor Mono",
  "BRMediaType/Media Type: *Plain Glossy Inkjet",
].join("\n");

describe("parsePrinterStatus", () => {
  it("parses idle and enabled", () => {
    expect(parsePrinterStatus(IDLE)).toEqual({ state: "idle", enabled: true });
  });

  it("parses printing and enabled", () => {
    expect(parsePrinterStatus(PRINTING)).toEqual({ state: "printing", enabled: true });
  });

  it("treats disabled as stopped", () => {
    expect(parsePrinterStatus(DISABLED)).toEqual({ state: "stopped", enabled: false });
  });

  it("handles empty output as stopped and disabled", () => {
    expect(parsePrinterStatus("")).toEqual({ state: "stopped", enabled: false });
  });
});

describe("parseCurrentJob", () => {
  it("extracts the current job id", () => {
    expect(parseCurrentJob(PRINTING)).toBe("DCPT230-42");
    expect(parseCurrentJob(IDLE)).toBeUndefined();
  });
});

describe("parseRequestId", () => {
  it("extracts the job id from lp output", () => {
    expect(parseRequestId("request id is DCPT230-42 (1 file(s))")).toBe("DCPT230-42");
    expect(parseRequestId("no id here")).toBeUndefined();
  });
});

describe("parseJobs", () => {
  it("parses job listing lines", () => {
    const jobs = parseJobs(
      [
        "DCPT230-11              zaidbrmh          1024   Thu Sep 24 15:23:26 2026",
        "DCPT230-10              zaidbrmh       1258496   Thu Sep 24 14:43:41 2026",
        "garbage line",
        "",
      ].join("\n"),
    );
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ id: "DCPT230-11", user: "zaidbrmh" });
    expect(Number.isNaN(Date.parse(jobs[0]!.submittedAt))).toBe(false);
  });
});

describe("parseCapabilities", () => {
  it("extracts page sizes, color option and duplex flag", () => {
    const caps = parseCapabilities(LPOPTIONS_OUTPUT);
    expect(caps.pageSizes).toContain("A4");
    expect(caps.pageSizes).toContain("Letter");
    expect(caps.color).toEqual({ option: "BRMonoColor", colorValue: "FullColor", monoValue: "Mono" });
    expect(caps.duplex).toBe(false);
  });

  it("detects duplex when advertised", () => {
    const withDuplex = `${LPOPTIONS_OUTPUT}\nDuplex/2-Sided Printing: *None DuplexNoTumble DuplexTumble`;
    expect(parseCapabilities(withDuplex).duplex).toBe(true);
  });
});

describe("parseDeviceUri + friendlyNameFromUri", () => {
  it("derives a friendly label from a USB URI", () => {
    const uri = parseDeviceUri("device for DCPT230: usb://Brother/DCP-T230?serial=E83754L5H439508");
    expect(uri).toBe("usb://Brother/DCP-T230?serial=E83754L5H439508");
    expect(friendlyNameFromUri(uri, "DCPT230")).toBe("Brother DCP T230");
  });

  it("falls back when the URI is unknown", () => {
    expect(friendlyNameFromUri(undefined, "DCPT230")).toBe("DCPT230");
  });
});
