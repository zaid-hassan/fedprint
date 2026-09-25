import { z } from "zod";
import { BadRequestError } from "../errors.js";

export const MAX_MARKDOWN_CHARS = 262_144;
export const MAX_DIAGRAMS = 20;
export const MAX_DIAGRAM_CHARS = 2_500_000;

const DATA_URL_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

const DiagramSchema = z.union([
  z.null(),
  z
    .string()
    .regex(DATA_URL_PATTERN, "The diagrams could not be read.")
    .max(MAX_DIAGRAM_CHARS, "A diagram is too large to print."),
]);

const MarkdownBodySchema = z.object({
  markdown: z
    .string({ required_error: "Write something to print first.", invalid_type_error: "Write something to print first." })
    .trim()
    .min(1, "Write something to print first.")
    .max(MAX_MARKDOWN_CHARS, "That document is too long to print."),
  diagrams: z.array(DiagramSchema).max(MAX_DIAGRAMS, "Too many diagrams to print.").optional().default([]),
});

export interface MarkdownBody {
  markdown: string;
  diagrams: Array<Buffer | null>;
}

/** Validates a markdown print request and decodes any rasterized diagrams. */
export function parseMarkdownBody(raw: unknown): MarkdownBody {
  const result = MarkdownBodySchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    if (issue && issue.path[0] === "diagrams") {
      throw new BadRequestError(issue.message === "Invalid input" ? "The diagrams could not be read." : issue.message);
    }
    throw new BadRequestError(issue?.message ?? "The document could not be read.");
  }

  const diagrams = result.data.diagrams.map((entry) =>
    entry === null ? null : Buffer.from(entry.slice(entry.indexOf(",") + 1), "base64"),
  );

  return { markdown: result.data.markdown, diagrams };
}
