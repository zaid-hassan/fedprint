import { config } from "../config.js";
import { mapCommandError } from "../errors.js";
import { lpstat, lpoptions } from "./cups.js";
import {
  friendlyNameFromUri,
  parseCapabilities,
  parseCurrentJob,
  parseDeviceUri,
  parsePrinterStatus,
  type ParsedCapabilities,
} from "./cups-parsers.js";
import { SUPPORTED_PAGE_SIZES, type ColorMode } from "../validation/print-options.js";

export type PrinterState = "idle" | "printing" | "stopped";

export interface PrinterStatus {
  name: string;
  status: PrinterState;
  enabled: boolean;
  message: string;
  currentJob?: string;
}

export interface PrinterCapabilities {
  pageSizes: string[];
  colors: ColorMode[];
  duplex: boolean;
  colorOption?: string;
  colorValue?: string;
  monoValue?: string;
}

const CAPABILITIES_TTL_MS = 60_000;

let cachedLabel: string | undefined;
let capabilitiesCache: { value: PrinterCapabilities; at: number } | undefined;

/** Human-friendly printer label, e.g. "Brother DCP-T230". */
export async function getPrinterLabel(): Promise<string> {
  if (cachedLabel) return cachedLabel;
  try {
    const stdout = await lpstat(["-v", config.printerName]);
    cachedLabel = friendlyNameFromUri(parseDeviceUri(stdout), config.printerName);
  } catch {
    cachedLabel = config.printerName;
  }
  return cachedLabel;
}

export async function getStatus(): Promise<PrinterStatus> {
  let stdout: string;
  try {
    stdout = await lpstat(["-p", config.printerName]);
  } catch (error) {
    throw mapCommandError(error, cachedLabel ?? config.printerName);
  }

  const { state, enabled } = parsePrinterStatus(stdout);
  const currentJob = parseCurrentJob(stdout);

  const status: PrinterStatus = {
    name: config.printerName,
    status: state,
    enabled,
    message: !enabled ? "Paused or disabled in CUPS" : state === "printing" ? "Printing" : state === "idle" ? "Ready" : "Unavailable",
  };
  if (currentJob) status.currentJob = currentJob;
  return status;
}

function toCapabilities(parsed: ParsedCapabilities): PrinterCapabilities {
  const availableSizes =
    parsed.pageSizes.length === 0
      ? [...SUPPORTED_PAGE_SIZES]
      : SUPPORTED_PAGE_SIZES.filter((size) => parsed.pageSizes.some((value) => value.toLowerCase() === size.toLowerCase()));

  const capabilities: PrinterCapabilities = {
    pageSizes: availableSizes.length > 0 ? availableSizes : ["A4"],
    colors: parsed.color ? ["color", "grayscale"] : ["color"],
    duplex: parsed.duplex,
  };

  if (parsed.color) {
    capabilities.colorOption = parsed.color.option;
    capabilities.colorValue = parsed.color.colorValue;
    capabilities.monoValue = parsed.color.monoValue;
  }

  return capabilities;
}

export async function getCapabilities(forceRefresh = false): Promise<PrinterCapabilities> {
  if (!forceRefresh && capabilitiesCache && Date.now() - capabilitiesCache.at < CAPABILITIES_TTL_MS) {
    return capabilitiesCache.value;
  }

  let parsed: ParsedCapabilities = { pageSizes: [], duplex: false };
  try {
    parsed = parseCapabilities(await lpoptions(["-p", config.printerName, "-l"]));
  } catch {
    // Fall back to defaults; status endpoint will surface CUPS problems.
  }

  const value = toCapabilities(parsed);
  capabilitiesCache = { value, at: Date.now() };
  return value;
}
