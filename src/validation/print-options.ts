import { z } from "zod";
import { BadRequestError } from "../errors.js";

export const SUPPORTED_PAGE_SIZES = ["A4", "A5", "Letter"] as const;
export const ORIENTATIONS = ["portrait", "landscape"] as const;
export const COLOR_MODES = ["color", "grayscale"] as const;
export const SIDES_MODES = ["one-sided", "two-sided-long-edge", "two-sided-short-edge"] as const;

export type SupportedPageSize = (typeof SUPPORTED_PAGE_SIZES)[number];
export type Orientation = (typeof ORIENTATIONS)[number];
export type ColorMode = (typeof COLOR_MODES)[number];
export type SidesMode = (typeof SIDES_MODES)[number];

export const PrintOptionsSchema = z.object({
  copies: z.coerce.number().int().min(1).max(20).default(1),
  pages: z.string().trim().default("all"),
  orientation: z.enum(ORIENTATIONS).default("portrait"),
  media: z.enum(SUPPORTED_PAGE_SIZES).default("A4"),
  color: z.enum(COLOR_MODES).default("color"),
  sides: z.enum(SIDES_MODES).default("one-sided"),
});

export type PrintOptions = z.infer<typeof PrintOptionsSchema>;

/** Validates and normalizes a CUPS page list such as `all`, `1-3`, `1,3,5`. */
export function parsePageRange(input: string): string {
  const value = input.trim().toLowerCase();
  if (value.length === 0 || value === "all") return "all";

  const tokens = value.split(",");
  const normalized: string[] = [];

  for (const rawToken of tokens) {
    const token = rawToken.replace(/\s+/g, "");
    if (token.length === 0) {
      throw new BadRequestError("Page range is invalid. Use formats like 1-3, 1,3,5, or all.");
    }

    const single = token.match(/^(\d+)$/);
    if (single) {
      const page = Number(single[1]);
      if (!Number.isInteger(page) || page < 1) {
        throw new BadRequestError("Page range is invalid. Page numbers must be 1 or greater.");
      }
      normalized.push(String(page));
      continue;
    }

    const range = token.match(/^(\d+)-(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
        throw new BadRequestError("Page range is invalid. The end page must be greater than or equal to the start page.");
      }
      normalized.push(`${from}-${to}`);
      continue;
    }

    throw new BadRequestError("Page range is invalid. Use formats like 1-3, 1,3,5, or all.");
  }

  return normalized.join(",");
}

function friendlyIssue(issue: z.ZodIssue): string {
  const field = issue.path[0];
  switch (field) {
    case "copies":
      return "Copies must be a whole number between 1 and 20.";
    case "media":
      return "Paper size must be A4, A5, or Letter.";
    case "orientation":
      return "Orientation must be portrait or landscape.";
    case "color":
      return "Color mode must be color or grayscale.";
    case "sides":
      return "Duplex mode is invalid.";
    case "pages":
      return "Page range is invalid. Use formats like 1-3, 1,3,5, or all.";
    default:
      return "One or more print options are invalid.";
  }
}

/** Parses raw multipart fields into validated print options. */
export function parsePrintOptions(raw: Record<string, unknown>): PrintOptions {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    cleaned[key] = value;
  }

  const result = PrintOptionsSchema.safeParse(cleaned);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new BadRequestError(issue ? friendlyIssue(issue) : "One or more print options are invalid.");
  }

  result.data.pages = parsePageRange(result.data.pages);
  return result.data;
}
