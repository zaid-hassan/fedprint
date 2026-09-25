import { marked, type RendererObject, type Tokens } from "marked";
import type { JobStatus } from "./types";

export const MAX_UPLOAD_MB = 25;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".txt"];

/**
 * Generates an idempotency key for a print attempt. `crypto.randomUUID` is
 * unavailable on plain-HTTP LAN pages, so fall back to getRandomValues.
 */
export function newRequestId(): string {
  const secureCrypto = globalThis.crypto;
  if (secureCrypto && typeof secureCrypto.randomUUID === "function") {
    try {
      return secureCrypto.randomUUID();
    } catch {
      // fall through
    }
  }
  if (secureCrypto && typeof secureCrypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    secureCrypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index).toLowerCase();
}

export function isAcceptedFile(file: File): boolean {
  return ACCEPTED_EXTENSIONS.includes(extensionOf(file.name));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  queued: "Queued",
  printing: "Printing",
  completed: "Completed",
  canceled: "Canceled",
  unknown: "Unknown",
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const markdownRenderer: RendererObject = {
  html(token: Tokens.HTML | Tokens.Tag) {
    return escapeHtml(token.text);
  },
  link(token: Tokens.Link) {
    return this.parser.parseInline(token.tokens);
  },
  image(token: Tokens.Image) {
    return token.text ?? "";
  },
};

marked.use({ gfm: true, breaks: true, renderer: markdownRenderer });

const MERMAID_BLOCK = /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g;

/**
 * Renders markdown to sanitized HTML for the preview pane. Raw HTML is
 * neutralised (without corrupting code text) and links are flattened, so
 * nothing executable is produced. Mermaid blocks become placeholders that the
 * editor renders into diagrams.
 */
export function renderMarkdownHtml(markdown: string): string {
  if (markdown.trim().length === 0) return "";
  const result = marked.parse(markdown, { async: false });
  const html = typeof result === "string" ? result : "";
  return html.replace(MERMAID_BLOCK, (_match, code: string) => `<div class="mermaid">${code}</div>`);
}

/** Best-effort PDF page count. Returns undefined when it cannot be determined. */
export async function countPdfPages(file: File): Promise<number | undefined> {
  if (extensionOf(file.name) !== ".pdf") return undefined;
  try {
    const slice = file.slice(0, 8 * 1024 * 1024);
    const text = await slice.text();
    const matches = text.match(/\/Type\s*\/Page[^s]/g);
    const count = matches?.length ?? 0;
    return count > 0 ? count : undefined;
  } catch {
    return undefined;
  }
}
