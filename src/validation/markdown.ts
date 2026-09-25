import { z } from "zod";
import { BadRequestError } from "../errors.js";

export const MAX_MARKDOWN_CHARS = 262_144;

const MarkdownBodySchema = z.object({
  markdown: z
    .string({ required_error: "Write something to print first.", invalid_type_error: "Write something to print first." })
    .trim()
    .min(1, "Write something to print first.")
    .max(MAX_MARKDOWN_CHARS, "That document is too long to print."),
});

/** Validates a markdown print request body and returns the markdown source. */
export function parseMarkdownBody(raw: unknown): string {
  const result = MarkdownBodySchema.safeParse(raw);
  if (!result.success) {
    throw new BadRequestError(result.error.issues[0]?.message ?? "The document could not be read.");
  }
  return result.data.markdown;
}
