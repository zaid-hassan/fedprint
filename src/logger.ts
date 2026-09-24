import { config } from "./config.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export type LogLevel = keyof typeof LEVELS;
export type LogMeta = Record<string, unknown>;

const threshold = LEVELS[config.logLevel];

function safeStringify(meta: LogMeta): string {
  try {
    return JSON.stringify(meta);
  } catch {
    return "[unserializable]";
  }
}

function emit(level: LogLevel, scope: string | undefined, message: string, meta?: LogMeta): void {
  if (LEVELS[level] < threshold) return;
  const scopePart = scope ? ` [${scope}]` : "";
  const metaPart = meta && Object.keys(meta).length > 0 ? ` ${safeStringify(meta)}` : "";
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}]${scopePart} ${message}${metaPart}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
  child(scope: string): Logger;
}

export function createLogger(scope?: string): Logger {
  return {
    debug: (message, meta) => emit("debug", scope, message, meta),
    info: (message, meta) => emit("info", scope, message, meta),
    warn: (message, meta) => emit("warn", scope, message, meta),
    error: (message, meta) => emit("error", scope, message, meta),
    child: (childScope) => createLogger(scope ? `${scope}:${childScope}` : childScope),
  };
}

export const logger = createLogger();
