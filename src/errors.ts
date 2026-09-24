import { CommandError } from "./utils/command.js";

export interface ErrorBody {
  ok: false;
  error: string;
  code: string;
}

export interface ErrorResponse {
  statusCode: number;
  body: ErrorBody;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code: string, options?: { cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class CupsUnavailableError extends AppError {
  constructor(cause?: unknown) {
    super(
      "Printing service is unavailable. Please check that CUPS is running.",
      503,
      "CUPS_UNAVAILABLE",
      cause !== undefined ? { cause } : undefined,
    );
  }
}

export class PrinterUnavailableError extends AppError {
  constructor(printerLabel: string, cause?: unknown) {
    super(
      `${printerLabel} is currently unavailable.`,
      503,
      "PRINTER_UNAVAILABLE",
      cause !== undefined ? { cause } : undefined,
    );
  }
}

export class UnsupportedFileError extends AppError {
  constructor() {
    super("This file type isn't supported. Please upload a PDF, JPG, PNG, or TXT file.", 415, "UNSUPPORTED_FILE");
  }
}

export class FileTooLargeError extends AppError {
  constructor(maxMb: number) {
    super(`File is too large. Maximum size is ${maxMb} MB.`, 413, "FILE_TOO_LARGE");
  }
}

export class MalformedUploadError extends AppError {
  constructor(cause?: unknown) {
    super("The upload could not be read. Please try again.", 400, "MALFORMED_UPLOAD", cause !== undefined ? { cause } : undefined);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400, "BAD_REQUEST");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested item was not found.") {
    super(message, 404, "NOT_FOUND");
  }
}

export class PrintFailedError extends AppError {
  constructor(cause?: unknown) {
    super(
      "The document could not be sent to the printer. Please try again.",
      500,
      "PRINT_FAILED",
      cause !== undefined ? { cause } : undefined,
    );
  }
}

/** Maps a failed system command to a user-facing error based on its failure mode. */
export function mapCommandError(error: unknown, printerLabel = "The printer"): AppError {
  if (error instanceof CommandError) {
    if (error.code === "ENOENT" || error.code === "TIMEOUT") {
      return new CupsUnavailableError(error);
    }
    if (error.code === "EXIT") {
      const stderr = error.stderr.toLowerCase();
      if (/invalid destination|unknown printer|no destination|does not exist/.test(stderr)) {
        return new PrinterUnavailableError(printerLabel, error);
      }
      if (/not accepting|disabled|paused|offline|unavailable|filter failed|rejecting/.test(stderr)) {
        return new PrinterUnavailableError(printerLabel, error);
      }
    }
  }
  return new PrintFailedError(error);
}

export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof AppError) {
    return { statusCode: error.statusCode, body: { ok: false, error: error.message, code: error.code } };
  }
  return {
    statusCode: 500,
    body: { ok: false, error: "Something went wrong. Please try again.", code: "INTERNAL" },
  };
}
