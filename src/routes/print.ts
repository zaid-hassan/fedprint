import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { BadRequestError, FileTooLargeError, UnsupportedFileError } from "../errors.js";
import {
  createTempPath,
  extensionOf,
  isAllowedExtension,
  isMimeConsistent,
  removeFile,
  sanitizeFilename,
} from "../services/file-manager.js";
import { getCapabilities, getPrinterLabel } from "../services/printer.js";
import { submit } from "../services/print-job.js";
import { parsePrintOptions } from "../validation/print-options.js";

export async function printRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/print", async (request) => {
    const fields: Record<string, unknown> = {};
    let tempPath: string | undefined;
    let displayName = "document";
    let extension = "";

    try {
      for await (const part of request.parts()) {
        if (part.type === "field") {
          fields[part.fieldname] = part.value;
          continue;
        }

        if (tempPath) {
          // Only the first file is used; drain any extras.
          part.file.resume();
          continue;
        }

        displayName = sanitizeFilename(part.filename ?? "document");
        extension = extensionOf(displayName);
        if (!isAllowedExtension(extension)) {
          part.file.resume();
          throw new UnsupportedFileError();
        }

        tempPath = createTempPath(extension);
        await pipeline(part.file, createWriteStream(tempPath));

        if (part.file.truncated) {
          throw new FileTooLargeError(config.maxUploadMb);
        }
      }

      if (!tempPath) {
        throw new BadRequestError("Please choose a file to print.");
      }

      if (!(await isMimeConsistent(tempPath, extension))) {
        throw new UnsupportedFileError();
      }

      const options = parsePrintOptions(fields);
      const [capabilities, printerLabel] = await Promise.all([getCapabilities(), getPrinterLabel()]);

      const { jobId } = await submit({ filePath: tempPath, displayName, options, capabilities, printerLabel });
      logger.info("Print job submitted", { jobId, copies: options.copies, pages: options.pages, media: options.media });

      return { ok: true, jobId, status: "queued" };
    } finally {
      if (tempPath) {
        try {
          await removeFile(tempPath);
        } catch (error) {
          logger.warn("Could not remove temp file", { reason: (error as Error).message });
        }
      }
    }
  });
}
