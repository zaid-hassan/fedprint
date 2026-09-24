import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

export const ALLOWED_TYPES: Readonly<Record<string, string>> = Object.freeze({
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".txt": "text/plain",
});

export function ensureUploadDir(): void {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

/** Removes any directory components and control characters from a user filename. */
export function sanitizeFilename(name: string): string {
  const base = path.basename(name);
  let withoutControl = "";
  for (const character of base) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue;
    withoutControl += character;
  }

  const cleaned = withoutControl
    .replace(/[\\/]+/g, "_")
    .replace(/^\.+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
    .trim();
  return cleaned.length > 0 ? cleaned : "document";
}

export function extensionOf(name: string): string {
  return path.extname(name).toLowerCase();
}

export function isAllowedExtension(extension: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED_TYPES, extension);
}

export function mimeForExtension(extension: string): string | undefined {
  return ALLOWED_TYPES[extension];
}

export function createTempPath(extension: string): string {
  return path.join(config.uploadDir, `${randomUUID()}${extension}`);
}

export async function removeFile(filePath: string): Promise<void> {
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** Deletes upload temp files older than maxAgeMs. Returns the number removed. */
export async function cleanupStale(maxAgeMs: number): Promise<number> {
  let entries: string[];
  try {
    entries = await fsp.readdir(config.uploadDir);
  } catch {
    return 0;
  }

  const now = Date.now();
  let removed = 0;
  for (const entry of entries) {
    const filePath = path.join(config.uploadDir, entry);
    try {
      const stat = await fsp.stat(filePath);
      if (stat.isFile() && now - stat.mtimeMs > maxAgeMs) {
        await removeFile(filePath);
        removed += 1;
      }
    } catch {
      // ignore files that disappear mid-scan
    }
  }
  return removed;
}

function startsWith(buffer: Buffer, bytes: readonly number[]): boolean {
  if (buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

/**
 * Confirms the file's magic bytes agree with its extension. Guards against
 * renamed executables; TXT has no signature and is accepted as-is.
 */
export async function isMimeConsistent(filePath: string, extension: string): Promise<boolean> {
  const handle = await fsp.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(8);
    const { bytesRead } = await handle.read(buffer, 0, 8, 0);
    const head = buffer.subarray(0, bytesRead);

    switch (extension) {
      case ".pdf":
        return head.subarray(0, 4).toString("latin1") === "%PDF";
      case ".png":
        return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      case ".jpg":
      case ".jpeg":
        return startsWith(head, [0xff, 0xd8, 0xff]);
      case ".txt":
        return true;
      default:
        return false;
    }
  } finally {
    await handle.close();
  }
}
