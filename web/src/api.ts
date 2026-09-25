import type { JobsResponse, PrintOptions, PrintResponse, PrinterStatus } from "./types";

type ErrorKind = "network" | "http";

export class ApiError extends Error {
  readonly kind: ErrorKind;
  readonly status: number | undefined;

  constructor(message: string, kind: ErrorKind, status?: number) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

interface RequestOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  networkMessage?: string;
}

const NETWORK_MESSAGE = "Connection lost while sending. Move closer to Wi-Fi and try again.";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps fetch with a timeout and network-level retries. `makeInit` is called
 * per attempt so a body (e.g. FormData) can be rebuilt safely. Print requests
 * pass a stable idempotency key, so retrying can never duplicate a job.
 */
async function request<T>(url: string, makeInit: () => RequestInit, options: RequestOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const retries = options.retries ?? 0;
  const retryDelayMs = options.retryDelayMs ?? 700;
  const networkMessage = options.networkMessage ?? NETWORK_MESSAGE;

  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...makeInit(), signal: controller.signal });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new ApiError(payload?.error ?? "Something went wrong. Please try again.", "http", response.status);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (attempt >= retries) throw new ApiError(networkMessage, "network");
      await delay(retryDelayMs * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
}

function jsonInit(method: string, body: unknown): () => RequestInit {
  return () => ({
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getPrinterStatus(): Promise<PrinterStatus> {
  return request<PrinterStatus>("/api/printer/status", () => ({}), {
    timeoutMs: 8_000,
    networkMessage: "Can't reach FedPrint. Check that the server is running.",
  });
}

export function getJobs(): Promise<JobsResponse> {
  return request<JobsResponse>("/api/jobs", () => ({}), { timeoutMs: 10_000 });
}

export function cancelJob(id: string): Promise<{ ok: true; jobId: string }> {
  return request(`/api/jobs/${encodeURIComponent(id)}/cancel`, () => ({ method: "POST" }), {
    timeoutMs: 15_000,
    retries: 1,
  });
}

function printForm(file: File, options: PrintOptions, requestId: string): FormData {
  const form = new FormData();
  form.append("copies", String(options.copies));
  form.append("pages", options.pages);
  form.append("orientation", options.orientation);
  form.append("media", options.media);
  form.append("color", options.color);
  form.append("sides", options.sides);
  form.append("requestId", requestId);
  form.append("file", file, file.name);
  return form;
}

export function printDocument(file: File, options: PrintOptions, requestId: string): Promise<PrintResponse> {
  return request<PrintResponse>("/api/print", () => ({ method: "POST", body: printForm(file, options, requestId) }), {
    timeoutMs: 180_000,
    retries: 1,
  });
}

export function printMarkdown(
  markdown: string,
  options: PrintOptions,
  requestId: string,
  diagrams: Array<string | null> = [],
): Promise<PrintResponse> {
  return request<PrintResponse>("/api/print/markdown", jsonInit("POST", { ...options, markdown, requestId, diagrams }), {
    timeoutMs: 60_000,
    retries: 1,
  });
}
