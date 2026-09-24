import { spawn, type ChildProcess } from "node:child_process";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { getPrimaryLanAddress } from "../utils/net.js";

const MDNS_HOST = "fedprint.local";
const log = logger.child("mdns");

let child: ChildProcess | undefined;
let stopping = false;

/**
 * Optionally publishes `fedprint.local` using the system avahi daemon. This
 * never fails startup: if avahi-publish is missing it is skipped with a warning.
 */
export async function startMdns(): Promise<void> {
  if (config.mdns === "false") {
    log.debug("mDNS disabled by configuration");
    return;
  }

  const address = getPrimaryLanAddress();
  if (!address) {
    log.warn("No LAN IPv4 address found; skipping mDNS");
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    let published = false;
    const finish = (): void => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    const proc = spawn("avahi-publish", ["-f", "-a", MDNS_HOST, address], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    child = proc;

    proc.once("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        if (config.mdns === "true") {
          log.warn("avahi-publish not found; install avahi-tools for fedprint.local");
        } else {
          log.info("mDNS unavailable (avahi-publish not installed)");
        }
      } else {
        log.warn("mDNS publish failed", { reason: error.message });
      }
      child = undefined;
      finish();
    });

    proc.once("spawn", () => {
      // avahi-publish keeps running while the record is registered; if it
      // exits almost immediately, publishing failed (for example a name
      // collision), so only report success once it has stayed up briefly.
      setTimeout(() => {
        if (child === proc && !stopping) {
          published = true;
          log.info(`mDNS published at http://${MDNS_HOST}:${config.port}`);
          finish();
        }
      }, 800).unref();
    });

    proc.once("exit", (code) => {
      child = undefined;
      if (!stopping) {
        if (published) {
          log.warn("mDNS publisher exited", { code });
        } else {
          log.warn(`Could not publish ${MDNS_HOST} (the name may already be in use); use the IP address instead`);
        }
      }
      finish();
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      log.debug("avahi output", { output: chunk.toString().trim() });
    });

    setTimeout(finish, 1_500).unref();
  });
}

export function stopMdns(): void {
  stopping = true;
  child?.kill("SIGTERM");
  child = undefined;
}
