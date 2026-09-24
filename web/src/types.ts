export type PrinterState = "idle" | "printing" | "stopped";

export interface PrinterCapabilities {
  pageSizes: string[];
  colors: ColorMode[];
  duplex: boolean;
}

export interface PrinterStatus {
  name: string;
  status: PrinterState;
  enabled: boolean;
  message: string;
  currentJob?: string;
  capabilities: PrinterCapabilities;
}

export type JobStatus = "queued" | "printing" | "completed" | "canceled" | "unknown";

export interface PrintJob {
  id: string;
  name: string;
  status: JobStatus;
  submittedAt: string;
  copies: number | null;
  user?: string;
}

export type Orientation = "portrait" | "landscape";
export type ColorMode = "color" | "grayscale";
export type SidesMode = "one-sided" | "two-sided-long-edge" | "two-sided-short-edge";

export interface PrintOptions {
  copies: number;
  pages: string;
  orientation: Orientation;
  media: string;
  color: ColorMode;
  sides: SidesMode;
}

export interface PrintResponse {
  ok: true;
  jobId: string;
  status: string;
}

export interface JobsResponse {
  jobs: PrintJob[];
}
