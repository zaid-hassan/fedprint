export type PrinterState = "idle" | "printing" | "stopped";

export interface ParsedPrinterStatus {
  state: PrinterState;
  enabled: boolean;
}

export interface RawJob {
  id: string;
  user: string;
  submittedAt: string;
}

export interface ColorCapability {
  option: string;
  colorValue: string;
  monoValue: string;
}

export interface ParsedCapabilities {
  pageSizes: string[];
  color?: ColorCapability;
  duplex: boolean;
}

/** Parses a single `lpstat -p <printer>` status line. */
export function parsePrinterStatus(stdout: string): ParsedPrinterStatus {
  const line = stdout.split("\n").find((value) => value.trim().length > 0) ?? "";
  const enabled = !/disabled/i.test(line) && /enabled/i.test(line);

  let state: PrinterState = "idle";
  if (/now printing/i.test(line)) {
    state = "printing";
  } else if (/is idle/i.test(line)) {
    state = "idle";
  } else if (/disabled|stopped|paused/i.test(line)) {
    state = "stopped";
  }

  if (!enabled) state = "stopped";
  return { state, enabled };
}

/** Extracts the job id currently being printed, e.g. `DCPT230-42`. */
export function parseCurrentJob(stdout: string): string | undefined {
  const match = stdout.match(/now printing\s+(\S+?)\./i);
  return match?.[1];
}

/** Extracts the job id from `lp` output: `request id is DCPT230-42 (1 file(s))`. */
export function parseRequestId(stdout: string): string | undefined {
  const match = stdout.match(/request id is\s+(\S+)/i);
  return match?.[1]?.replace(/[.,;]+$/, "");
}

const JOB_LINE = /^(\S+)\s+(\S+)\s+\d+\s+(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\b/;

/** Parses `lpstat -o` / `lpstat -W completed -o` job listings. */
export function parseJobs(stdout: string): RawJob[] {
  const jobs: RawJob[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const match = trimmed.match(JOB_LINE);
    if (!match) continue;
    const [, id, user, dateText] = match;
    if (!id || !user || !dateText) continue;
    const timestamp = Date.parse(dateText);
    if (Number.isNaN(timestamp)) continue;
    jobs.push({ id, user, submittedAt: new Date(timestamp).toISOString() });
  }
  return jobs;
}

/** Extracts the device URI from `lpstat -v <printer>`. */
export function parseDeviceUri(stdout: string): string | undefined {
  const match = stdout.match(/device for\s+\S+:\s+(\S+)/i);
  return match?.[1];
}

interface OptionEntry {
  keyword: string;
  values: string[];
}

function parseOptionLines(stdout: string): OptionEntry[] {
  const entries: OptionEntry[] = [];
  for (const line of stdout.split("\n")) {
    const separator = line.indexOf(": ");
    if (separator === -1) continue;
    const left = line.slice(0, separator);
    const right = line.slice(separator + 2);
    const keyword = left.split("/")[0]?.trim();
    if (!keyword) continue;
    const values = right
      .split(/\s+/)
      .map((value) => value.replace(/^\*/, "").trim())
      .filter((value) => value.length > 0);
    entries.push({ keyword, values });
  }
  return entries;
}

/** Parses `lpoptions -p <printer> -l` output into the capabilities FedPrint exposes. */
export function parseCapabilities(stdout: string): ParsedCapabilities {
  const entries = parseOptionLines(stdout);

  const pageSizeEntry = entries.find((entry) => /^(PageSize|MediaSize|media)$/i.test(entry.keyword));
  const pageSizes = pageSizeEntry?.values ?? [];

  let color: ColorCapability | undefined;
  for (const entry of entries) {
    const monoValue = entry.values.find((value) => /^mono(chrome)?$/i.test(value));
    const colorValue = entry.values.find((value) => /^(full)?colou?r$/i.test(value));
    if (monoValue && colorValue) {
      color = { option: entry.keyword, colorValue, monoValue };
      break;
    }
  }

  const duplex = entries.some(
    (entry) => /duplex|sides/i.test(entry.keyword) || entry.values.some((value) => /two-sided/i.test(value)),
  );

  const result: ParsedCapabilities = { pageSizes, duplex };
  if (color) result.color = color;
  return result;
}

const USB_DEVICE = /^usb:\/\/([^/]+)\/([^?/]+)/i;

/** Derives a friendly printer label from a CUPS device URI, e.g. "Brother DCP-T230". */
export function friendlyNameFromUri(uri: string | undefined, fallback: string): string {
  if (!uri) return fallback;

  const usbMatch = uri.match(USB_DEVICE);
  if (usbMatch) {
    const vendor = decodeURIComponent(usbMatch[1] ?? "").trim();
    const model = decodeURIComponent(usbMatch[2] ?? "")
      .replace(/[-_]+/g, " ")
      .trim();
    const combined = `${vendor} ${model}`.trim();
    if (combined) return combined;
  }

  return fallback;
}
