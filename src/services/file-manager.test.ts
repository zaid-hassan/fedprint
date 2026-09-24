import fsp from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTempPath,
  ensureUploadDir,
  extensionOf,
  isAllowedExtension,
  isMimeConsistent,
  removeFile,
  sanitizeFilename,
} from "./file-manager.js";

const created: string[] = [];

async function writeTemp(extension: string, bytes: Buffer): Promise<string> {
  const filePath = createTempPath(extension);
  await fsp.writeFile(filePath, bytes);
  created.push(filePath);
  return filePath;
}

beforeAll(() => ensureUploadDir());
afterAll(async () => {
  await Promise.all(created.map((filePath) => removeFile(filePath)));
});

describe("sanitizeFilename", () => {
  it("strips directory components", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("/tmp/report.pdf")).toBe("report.pdf");
  });

  it("removes control characters and trims length", () => {
    expect(sanitizeFilename("a\u0000b\u0007.pdf")).toBe("ab.pdf");
    expect(sanitizeFilename("x".repeat(300)).length).toBe(120);
  });

  it("falls back for empty names", () => {
    expect(sanitizeFilename("...")).toBe("document");
    expect(sanitizeFilename("")).toBe("document");
  });
});

describe("extension helpers", () => {
  it("normalizes and validates extensions", () => {
    expect(extensionOf("Photo.JPG")).toBe(".jpg");
    expect(isAllowedExtension(".pdf")).toBe(true);
    expect(isAllowedExtension(".exe")).toBe(false);
  });
});

describe("createTempPath", () => {
  it("generates unique random names with the extension", () => {
    const first = createTempPath(".pdf");
    const second = createTempPath(".pdf");
    expect(first).not.toBe(second);
    expect(first.endsWith(".pdf")).toBe(true);
  });
});

describe("isMimeConsistent", () => {
  it("accepts matching magic bytes", async () => {
    const pdf = await writeTemp(".pdf", Buffer.from("%PDF-1.7\n"));
    const png = await writeTemp(".png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]));
    const jpg = await writeTemp(".jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    expect(await isMimeConsistent(pdf, ".pdf")).toBe(true);
    expect(await isMimeConsistent(png, ".png")).toBe(true);
    expect(await isMimeConsistent(jpg, ".jpg")).toBe(true);
  });

  it("rejects mismatched magic bytes", async () => {
    const fakePdf = await writeTemp(".pdf", Buffer.from("MZ this is not a pdf"));
    expect(await isMimeConsistent(fakePdf, ".pdf")).toBe(false);
  });

  it("accepts any text file", async () => {
    const txt = await writeTemp(".txt", Buffer.from("hello world"));
    expect(await isMimeConsistent(txt, ".txt")).toBe(true);
  });
});
