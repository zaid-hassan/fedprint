import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

function loadDotEnv(): void {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  try {
    process.loadEnvFile(envPath);
  } catch {
    process.stderr.write("[WARN] Could not parse .env; using environment only.\n");
  }
}

loadDotEnv();

const EnvSchema = z.object({
  PRINTER_NAME: z.string().trim().min(1).max(128).default("DCPT230"),
  PORT: z.coerce.number().int().min(1).max(65535).default(27183),
  HOST: z.string().trim().min(1).default("0.0.0.0"),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(1024).default(25),
  UPLOAD_DIR: z.string().trim().min(1).default("./uploads"),
  MDNS_ENABLED: z.enum(["auto", "true", "false"]).default("auto"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  process.stderr.write(`[ERROR] Invalid FedPrint configuration:\n${issues}\n`);
  process.exit(1);
}

const env = parsed.data;

export const config = Object.freeze({
  printerName: env.PRINTER_NAME,
  port: env.PORT,
  host: env.HOST,
  maxUploadMb: env.MAX_UPLOAD_MB,
  maxUploadBytes: Math.floor(env.MAX_UPLOAD_MB * 1024 * 1024),
  uploadDir: path.resolve(process.cwd(), env.UPLOAD_DIR),
  mdns: env.MDNS_ENABLED,
  logLevel: env.LOG_LEVEL,
});

export type Config = typeof config;
