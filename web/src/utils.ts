import type { JobStatus } from "./types";

export const MAX_UPLOAD_MB = 25;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".txt"];

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
