import type { JobsResponse, PrintOptions, PrintResponse, PrinterStatus } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("Could not reach FedPrint. Check that the server is running.");
  }

  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? "Something went wrong. Please try again.");
  }
  return payload as T;
}

export function getPrinterStatus(): Promise<PrinterStatus> {
  return request<PrinterStatus>("/api/printer/status");
}

export function getJobs(): Promise<JobsResponse> {
  return request<JobsResponse>("/api/jobs");
}

export function cancelJob(id: string): Promise<{ ok: true; jobId: string }> {
  return request(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}

export function printDocument(file: File, options: PrintOptions): Promise<PrintResponse> {
  const form = new FormData();
  form.append("copies", String(options.copies));
  form.append("pages", options.pages);
  form.append("orientation", options.orientation);
  form.append("media", options.media);
  form.append("color", options.color);
  form.append("sides", options.sides);
  form.append("file", file, file.name);

  return request<PrintResponse>("/api/print", { method: "POST", body: form });
}
