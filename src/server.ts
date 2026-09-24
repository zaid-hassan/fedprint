import { buildApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { cleanupStale, ensureUploadDir } from "./services/file-manager.js";
import { pruneOlderThan } from "./services/job-registry.js";
import { startMdns, stopMdns } from "./services/mdns.js";
import { getPrinterLabel } from "./services/printer.js";
import { getLanAddresses } from "./utils/net.js";

const STALE_UPLOAD_MS = 6 * 60 * 60 * 1000;
const JOB_RECORD_MS = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  ensureUploadDir();

  const removed = await cleanupStale(STALE_UPLOAD_MS);
  if (removed > 0) logger.info(`Removed ${removed} stale upload(s)`);
  pruneOlderThan(JOB_RECORD_MS);

  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });

  const printerLabel = await getPrinterLabel();

  logger.info("FedPrint is running");
  logger.info(`Local:   http://localhost:${config.port}`);
  for (const address of getLanAddresses()) {
    logger.info(`Network: http://${address}:${config.port}`);
  }
  logger.info(`Printer: ${printerLabel}`);
  logger.info(`CUPS:    ${config.printerName}`);

  await startMdns();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Shutting down (${signal})`);
    stopMdns();
    try {
      await app.close();
    } catch (error) {
      logger.warn("Error during shutdown", { reason: (error as Error).message });
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  logger.error("FedPrint failed to start", { reason: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
