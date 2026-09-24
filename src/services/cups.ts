import { run } from "../utils/command.js";

/**
 * Low-level adapter around the CUPS command line tools. This is the only
 * module in FedPrint allowed to invoke system commands. It always passes
 * explicit argument arrays (never a shell).
 */

export function lpstat(args: readonly string[], timeoutMs = 10_000): Promise<string> {
  return run("lpstat", args, { timeoutMs }).then((result) => result.stdout);
}

export function lpoptions(args: readonly string[], timeoutMs = 10_000): Promise<string> {
  return run("lpoptions", args, { timeoutMs }).then((result) => result.stdout);
}

export function lp(args: readonly string[], timeoutMs = 60_000): Promise<string> {
  return run("lp", args, { timeoutMs }).then((result) => result.stdout);
}

export function cancel(args: readonly string[], timeoutMs = 10_000): Promise<string> {
  return run("cancel", args, { timeoutMs }).then((result) => result.stdout);
}
