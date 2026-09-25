import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { BadRequestError, FileTooLargeError, MalformedUploadError, toErrorResponse } from "./errors.js";
import { healthRoutes } from "./routes/health.js";
import { jobsRoutes } from "./routes/jobs.js";
import { printRoutes } from "./routes/print.js";
import { printerRoutes } from "./routes/printer.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(dirname, "../dist-web");

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    bodyLimit: Math.max(config.maxUploadBytes + 1024 * 1024, 2 * 1024 * 1024),
    trustProxy: false,
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    let normalized: unknown = error;
    const code = error.code;

    if (code === "FST_REQ_FILE_TOO_LARGE" || code === "FST_FILES_LIMIT") {
      normalized = new FileTooLargeError(config.maxUploadMb);
    } else if (
      code === "FST_INVALID_MULTIPART_CONTENT_TYPE" ||
      code === "FST_PARTS_LIMIT" ||
      code === "FST_FIELDS_LIMIT" ||
      code === "FST_INVALID_MULTIPART_FIELD" ||
      code === "FST_MULTIPART_CONTENT_TYPE_NOT_ALLOWED"
    ) {
      normalized = new MalformedUploadError(error);
    } else if (error.validation) {
      normalized = new BadRequestError("The request was not valid.");
    }

    const { statusCode, body } = toErrorResponse(normalized);
    if (statusCode >= 500) {
      logger.error("Request failed", { url: request.url, reason: error.message });
    } else {
      logger.warn("Request rejected", { url: request.url, reason: error.message, code: body.code });
    }

    reply.status(statusCode).send(body);
  });

  await app.register(multipart, {
    limits: {
      fileSize: config.maxUploadBytes,
      files: 1,
      fields: 16,
      parts: 20,
    },
  });

  const hasWebBuild = fs.existsSync(path.join(WEB_ROOT, "index.html"));
  if (hasWebBuild) {
    await app.register(fastifyStatic, { root: WEB_ROOT, prefix: "/" });
  } else {
    logger.warn("Web UI not built; run `npm run web:build`. API is still available.");
    app.get("/", async (_request, reply) => {
      reply.type("text/plain");
      return "FedPrint API is running. Build the web UI with `npm run web:build`.";
    });
  }

  await app.register(healthRoutes);
  await app.register(printerRoutes);
  await app.register(printRoutes);
  await app.register(jobsRoutes);

  // Log every state-changing request and any server error so intermittent
  // mobile failures can be diagnosed from the journal.
  app.addHook("onResponse", async (request, reply) => {
    if (request.method !== "POST" && reply.statusCode < 500) return;
    const meta = {
      method: request.method,
      url: request.routeOptions.url ?? request.url,
      status: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime),
    };
    if (reply.statusCode >= 500) logger.error("Request completed", meta);
    else if (reply.statusCode >= 400) logger.warn("Request completed", meta);
    else logger.info("Request completed", meta);
  });

  return app;
}
