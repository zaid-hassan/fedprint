import { config } from "../config.js";
import { BadRequestError, NotFoundError, PrintFailedError, mapCommandError } from "../errors.js";
import { cancel, lp, lpstat } from "./cups.js";
import { parseCurrentJob, parseJobs, parseRequestId, type RawJob } from "./cups-parsers.js";
import { markCanceled, recall, remember, wasCanceled } from "./job-registry.js";
import type { PrintOptions } from "../validation/print-options.js";
import type { PrinterCapabilities } from "./printer.js";

export type JobStatus = "queued" | "printing" | "completed" | "canceled" | "unknown";

export interface PrintJob {
  id: string;
  name: string;
  status: JobStatus;
  submittedAt: string;
  copies: number | null;
  user?: string;
}

export interface SubmitInput {
  filePath: string;
  displayName: string;
  options: PrintOptions;
  capabilities: PrinterCapabilities;
  printerLabel: string;
}

const JOB_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const MAX_LISTED_JOBS = 25;

export function buildLpArgs(input: SubmitInput): string[] {
  const { filePath, displayName, options, capabilities } = input;

  const args: string[] = [
    "-d",
    config.printerName,
    "-t",
    displayName,
    "-n",
    String(options.copies),
    "-o",
    `orientation-requested=${options.orientation === "landscape" ? 4 : 3}`,
  ];

  const media = capabilities.pageSizes.includes(options.media) ? options.media : "A4";
  args.push("-o", `media=${media}`);

  if (capabilities.colorOption && capabilities.colorValue && capabilities.monoValue) {
    const chosen = options.color === "grayscale" ? capabilities.monoValue : capabilities.colorValue;
    args.push("-o", `${capabilities.colorOption}=${chosen}`);
  }

  if (capabilities.duplex && options.sides !== "one-sided") {
    args.push("-o", `sides=${options.sides}`);
  }

  if (options.pages !== "all") {
    args.push("-P", options.pages);
  }

  args.push("--", filePath);
  return args;
}

export async function submit(input: SubmitInput): Promise<{ jobId: string }> {
  const args = buildLpArgs(input);

  let stdout: string;
  try {
    stdout = await lp(args);
  } catch (error) {
    throw mapCommandError(error, input.printerLabel);
  }

  const jobId = parseRequestId(stdout);
  if (!jobId) {
    throw new PrintFailedError();
  }

  remember({
    id: jobId,
    name: input.displayName,
    copies: input.options.copies,
    submittedAt: new Date().toISOString(),
  });

  return { jobId };
}

function normalizeJobs(jobs: RawJob[], status: JobStatus, currentJob: string | undefined, byId: Map<string, PrintJob>): void {
  for (const job of jobs) {
    const record = recall(job.id);
    const resolved: JobStatus =
      status === "completed" && wasCanceled(job.id)
        ? "canceled"
        : status === "queued" && job.id === currentJob
          ? "printing"
          : status;
    const entry: PrintJob = {
      id: job.id,
      name: record?.name ?? "Document",
      status: resolved,
      submittedAt: job.submittedAt,
      copies: record?.copies ?? null,
      user: job.user,
    };
    byId.set(job.id, entry);
  }
}

export async function list(): Promise<PrintJob[]> {
  let activeOut: string;
  let completedOut: string;
  let statusOut: string;

  try {
    [activeOut, completedOut, statusOut] = await Promise.all([
      lpstat(["-o", config.printerName]),
      lpstat(["-W", "completed", "-o", config.printerName]),
      lpstat(["-p", config.printerName]),
    ]);
  } catch (error) {
    throw mapCommandError(error);
  }

  const byId = new Map<string, PrintJob>();
  normalizeJobs(parseJobs(completedOut), "completed", undefined, byId);
  normalizeJobs(parseJobs(activeOut), "queued", parseCurrentJob(statusOut), byId);

  return [...byId.values()]
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))
    .slice(0, MAX_LISTED_JOBS);
}

function resolveJobId(requested: string, active: RawJob[]): string | undefined {
  if (active.some((job) => job.id === requested)) return requested;
  if (/^\d+$/.test(requested)) {
    return active.find((job) => job.id.endsWith(`-${requested}`))?.id;
  }
  return undefined;
}

export async function cancelJob(requestedId: string): Promise<string> {
  if (!JOB_ID_PATTERN.test(requestedId)) {
    throw new BadRequestError("That job id is not valid.");
  }

  let activeOut: string;
  try {
    activeOut = await lpstat(["-o", config.printerName]);
  } catch (error) {
    throw mapCommandError(error);
  }

  const active = parseJobs(activeOut);
  const jobId = resolveJobId(requestedId, active);
  if (!jobId) {
    throw new NotFoundError("That job is no longer active, so it cannot be cancelled.");
  }

  try {
    await cancel([jobId]);
  } catch (error) {
    throw mapCommandError(error);
  }

  markCanceled(jobId);
  return jobId;
}
