import { execFile } from "node:child_process";

export type CommandFailureCode = "ENOENT" | "TIMEOUT" | "EXIT" | "UNKNOWN";

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export class CommandError extends Error {
  readonly code: CommandFailureCode;
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode: number | undefined;
  readonly stderr: string;

  constructor(
    code: CommandFailureCode,
    command: string,
    args: readonly string[],
    options: { exitCode?: number; stderr?: string; cause?: unknown } = {},
  ) {
    super(`Command failed (${code}): ${command}`, { cause: options.cause });
    this.name = "CommandError";
    this.code = code;
    this.command = command;
    this.args = args;
    this.exitCode = options.exitCode;
    this.stderr = options.stderr ?? "";
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_BUFFER_BYTES = 8 * 1024 * 1024;

/**
 * Executes a program with an explicit argument array. Never uses a shell, so
 * untrusted input can never be interpreted as shell syntax.
 */
export function run(command: string, args: readonly string[], options: RunOptions = {}): Promise<CommandResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<CommandResult>((resolve, reject) => {
    execFile(
      command,
      [...args],
      {
        timeout: timeoutMs,
        maxBuffer: MAX_BUFFER_BYTES,
        encoding: "utf8",
        windowsHide: true,
        env: { ...process.env, LANG: "C", LC_ALL: "C", ...options.env },
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
          return;
        }

        const err = error as NodeJS.ErrnoException & { killed?: boolean };
        const rawCode = err.code as string | number | undefined;

        if (rawCode === "ENOENT") {
          reject(new CommandError("ENOENT", command, args, { cause: error }));
          return;
        }

        if (err.killed || rawCode === "ETIMEDOUT") {
          reject(new CommandError("TIMEOUT", command, args, { cause: error }));
          return;
        }

        if (typeof rawCode === "number") {
          reject(
            new CommandError("EXIT", command, args, {
              exitCode: rawCode,
              stderr: stderr ?? "",
              cause: error,
            }),
          );
          return;
        }

        reject(new CommandError("UNKNOWN", command, args, { cause: error }));
      },
    );
  });
}
